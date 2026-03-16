"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import GoogleMapsEmbed from "../components/GoogleMapsEmbed";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Restaurant = {
  place_id: string;
  name: string;
  rating: number;
  reviews: number;
  gps_coordinates: { latitude: number; longitude: number };
  cuisine?: string;
  priceRange?: string;
};

type Bounds = { north: number; south: number; east: number; west: number };

const ZOOM_THRESHOLD = 10;

export default function Page() {
  const [location, setLocation] = useState("");
  const [polygon, setPolygon] = useState<{lat: number, lng: number}[]>([]);
  const [isPolygonValid, setIsPolygonValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [placeCount, setPlaceCount] = useState<number | null>(null);
  const [clearPolygon, setClearPolygon] = useState(false);
  
  // Viewport tracking state
  const [zoom, setZoom] = useState<number>(4);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [hoveredRestaurantId, setHoveredRestaurantId] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  
  // Handlers for map viewport changes
  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);
  
  const handleBoundsChange = useCallback((newBounds: Bounds) => {
    setBounds(newBounds);
  }, []);
  
  // Filter restaurants to only those visible in the current viewport
  const visibleRestaurants = useMemo(() => {
    if (zoom < ZOOM_THRESHOLD || !bounds) {
      return [];
    }
    
    return restaurants.filter((restaurant) => {
      const { latitude, longitude } = restaurant.gps_coordinates;
      return (
        latitude >= bounds.south &&
        latitude <= bounds.north &&
        longitude >= bounds.west &&
        longitude <= bounds.east
      );
    }).sort((a, b) => {
      // Sort by rating (descending), then by reviews (descending)
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.reviews - a.reviews;
    });
  }, [restaurants, zoom, bounds]);
  
  const showRestaurantList = zoom >= ZOOM_THRESHOLD && visibleRestaurants.length > 0;

  // Fetch restaurant data from backend API
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const res = await fetch(`${apiUrl}/places?minRating=4.5&minReviews=1000`);
        
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        
        const data = await res.json();
        
        // Transform API response to Restaurant format
        const restaurants: Restaurant[] = data.map((place: {
          place_id: string;
          name: string;
          rating: number;
          reviews: number;
          lat: number;
          lng: number;
          cuisine?: string;
          priceMin?: number;
          priceMax?: number;
        }) => ({
          place_id: place.place_id,
          name: place.name,
          rating: place.rating,
          reviews: place.reviews,
          gps_coordinates: { latitude: place.lat, longitude: place.lng },
          cuisine: place.cuisine || "Restaurant",
          priceRange: place.priceMin && place.priceMax 
            ? `$${place.priceMin} - $${place.priceMax}` 
            : ""
        }));
        
        setRestaurants(restaurants);
      } catch (error) {
        console.error('Error fetching restaurants:', error);
      }
    };

    fetchRestaurants();
  }, [apiUrl]);

  // Close price panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (priceDialogOpen && !target.closest('[data-price-panel]')) {
        setPriceDialogOpen(false);
      }
    };

    if (priceDialogOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [priceDialogOpen]);

  const handleCountCall = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/count`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          polygon: polygon.map(p => ({ lat: p.lat, lng: p.lng }))
        })
      });

      const data = await response.json();

      if (response.ok) {
        setPlaceCount(data.count);
        setModalOpen(true);
      } else {
        alert(`Error: ${data.error || 'Failed to get count'}`);
      }
    } catch (error) {
      console.error('Count error:', error);
      alert('Failed to get count');
    } finally {
      setLoading(false);
    }
  }

  const handleCollectPlaces = async () => {
    setLoading(true);
    
    try {
      const response = await fetch(`${apiUrl}/collectAndHydrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          polygon: polygon.map(p => ({ lat: p.lat, lng: p.lng }))
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Convert backend response to Restaurant format
        // Filter to only show places with 1000+ reviews (TopSpots criteria)
        const MIN_REVIEWS = 1000;
        
        const newRestaurants: Restaurant[] = (data.places || [])
          .filter((place: { userRatingCount: number }) => place.userRatingCount >= MIN_REVIEWS)
          .map((place: {
            placeId: string;
            displayName: string;
            rating: number;
            userRatingCount: number;
            lat: number;
            lng: number;
            primaryTypeDisplayName?: string;
            priceMin?: number;
            priceMax?: number;
          }) => ({
            place_id: place.placeId,
            name: place.displayName,
            rating: place.rating,
            reviews: place.userRatingCount,
            gps_coordinates: { latitude: place.lat, longitude: place.lng },
            cuisine: place.primaryTypeDisplayName || 'Restaurant',
            priceRange: place.priceMin && place.priceMax 
              ? `$${place.priceMin} - $${place.priceMax}` 
              : ''
          }));
        
        console.log(`Filtered to ${newRestaurants.length} places with ${MIN_REVIEWS}+ reviews`);
        
        // Add to existing restaurants
        setRestaurants(prev => [...prev, ...newRestaurants]);
      } else {
        console.error('Collect API error:', response.status);
        alert('Failed to collect places');
      }
    } catch (error) {
      console.error('Collect error:', error);
      alert('Failed to collect places');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 relative">
      <div className="absolute left-0 top-0 bottom-0 w-1/3 p-8 bg-white/10 dark:bg-black/10 backdrop-blur-xl border-r border-white/20 z-10 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-6xl font-bold text-slate-900">
              TopSpots
            </h1>
            <button
              onClick={() => setHelpOpen(true)}
              className="w-8 h-8 rounded-full border-2 border-slate-400 text-slate-600 hover:border-slate-600 hover:text-slate-800 flex items-center justify-center text-lg font-semibold transition-colors"
              aria-label="Help"
            >
              ?
            </button>
          </div>
          <div className="text-m text-slate-700 mb-4">
            Zoom in or search for an area to conduct your own search
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Search Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter city or address..."
                className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
              />
            </div>

            {location && (
              <div className={`p-4 border rounded-lg ${
                polygon.length === 4 && isPolygonValid
                  ? 'bg-green-50 border-green-200'
                  : polygon.length === 4 && !isPolygonValid
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <p className="text-sm text-slate-700 mb-1">
                  Click <span className="font-semibold">4 points</span> on the map
                </p>
                <p className="text-sm text-slate-600">
                  Points selected: <span className="font-semibold">{polygon.length}/4</span>
                </p>
              </div>
            )}

            {polygon.length === 4 && !isPolygonValid && (
              <div className="p-4 bg-orange-50 border border-orange-300 rounded-lg">
                <p className="text-sm text-orange-700 font-medium">
                  ⚠️ Polygon must be drawn counter-clockwise
                </p>
              </div>
            )}

            {polygon.length > 0 && (
              <Button
                onClick={() => {
                  setPolygon([]);
                  setClearPolygon(true);
                }}
                variant="outline"
                className="w-full"
              >
                Clear Points
              </Button>
            )}

            {polygon.length === 4 && (
              <Button
                onClick={handleCountCall}
                disabled={loading || !isPolygonValid}
                className="w-full"
              >
                {loading ? 'Searching...' : 'Search Area'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full h-full">
        <GoogleMapsEmbed
          location={location}
          onPolygonChange={setPolygon}
          onPolygonValidation={setIsPolygonValid}
          clearPolygon={clearPolygon}
          onPolygonCleared={() => setClearPolygon(false)}
          isLocked={false}
          centerOffset={-7}
          restaurants={restaurants}
          onZoomChange={handleZoomChange}
          onBoundsChange={handleBoundsChange}
          hoveredRestaurantId={hoveredRestaurantId}
        />
      </div>

      {/* Restaurant List Panel - appears when zoomed in */}
      <div 
        className={`
          absolute right-0 top-0 bottom-0 w-1/6 
          bg-white/10 dark:bg-black/10 backdrop-blur-xl
          border-l border-white/20
          transition-transform duration-300 ease-out
          ${showRestaurantList ? 'translate-x-0' : 'translate-x-full'}
          z-20 flex flex-col
        `}
      >
        {/* Panel Header */}
        <div className="p-4 border-b border-white/20">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            TopSpots in View
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {visibleRestaurants.length} restaurant{visibleRestaurants.length !== 1 ? 's' : ''} • 4.5★+ • 1000+ reviews
          </p>
        </div>

        {/* Scrollable Restaurant List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {visibleRestaurants.map((restaurant) => {
              const isHovered = hoveredRestaurantId === restaurant.place_id;
              const cleanPlaceId = restaurant.place_id.replace('places/', '');
              const googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${cleanPlaceId}`;
              
              return (
                <article
                  key={restaurant.place_id}
                  className={`
                    p-3 rounded-lg border cursor-pointer
                    transition-all duration-150 ease-out
                    ${isHovered 
                      ? 'bg-white/40 border-white/60 shadow-md dark:bg-white/20' 
                      : 'bg-white/20 border-white/30 hover:bg-white/30 hover:border-white/50 dark:bg-white/10 dark:border-white/20'
                    }
                  `}
                  onMouseEnter={() => setHoveredRestaurantId(restaurant.place_id)}
                  onMouseLeave={() => setHoveredRestaurantId(null)}
                  onClick={() => window.open(googleMapsUrl, '_blank')}
                >
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug mb-1">
                    {restaurant.name}
                  </h3>
                  
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    {restaurant.cuisine || 'Restaurant'}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-amber-500">⭐</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {restaurant.rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {restaurant.reviews.toLocaleString()} reviews
                    </div>
                  </div>
                  
                  {restaurant.priceRange && (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      {restaurant.priceRange}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search Results</DialogTitle>
            <DialogDescription>
              Here&apos;s what we found in your selected area
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-2xl font-bold text-slate-900 text-center">
                {placeCount !== null ? placeCount : '—'}
              </p>
              <p className="text-sm text-slate-600 text-center mt-1">
                places found in this area
              </p>

              {placeCount !== null && placeCount > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <div className="flex flex-col items-center">
                    <p className="text-lg font-semibold text-slate-800">
                      ${((placeCount * 0.02) * 1.029 + 0.30).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 text-center mt-1">cost</p>
                    <div className="relative" data-price-panel>
                      <button
                        onClick={() => setPriceDialogOpen(!priceDialogOpen)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline mt-1"
                        data-price-panel
                      >
                        why so expensive?
                      </button>
                      {priceDialogOpen && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-48 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-50" data-price-panel>
                          <p>Google Maps API charges $0.02 per place, and we add a 2.9% fee + $0.30 for Stripe processing.</p>
                          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button 
              onClick={() => { handleCollectPlaces(); setModalOpen(false); }} 
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Finding...' : 'Find TopSpots'}
            </Button>

            <Button onClick={() => setModalOpen(false)} variant="outline" className="w-full">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Welcome to TopSpots</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <p className="text-slate-600 dark:text-slate-100">
              Check out places we&apos;ve already found, or add places in your own search area by defining a polygon
            </p>

            <Button onClick={() => setHelpOpen(false)} className="w-full">
              Got it!
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
