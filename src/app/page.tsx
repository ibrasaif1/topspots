"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useTransition, useDeferredValue } from "react";
import GoogleMapsEmbed from "../components/GoogleMapsEmbed";
import CategoryFilter from "@/components/CategoryFilter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CategoryId,
  CATEGORIES,
  DEFAULT_SELECTED_CATEGORIES,
  matchesAnyCategory,
  getWidestFetchParams,
} from "@/config/filters";
import { Star, Home, FlaskConical, Flame, Sun, Moon, CircleDotDashed } from "lucide-react";
import { useTheme } from "next-themes";
import { Toggle } from "@/components/ui/toggle";
import { LEFT_SIDEBAR_FRACTION, RIGHT_SIDEBAR_FRACTION } from "@/lib/utils";

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

function formatPrice(priceMin?: number, priceMax?: number, priceLevel?: string): string {
  if (priceMin && priceMax) return `$${priceMin} - $${priceMax}`;
  const levelMap: Record<string, string> = {
    PRICE_LEVEL_INEXPENSIVE: "Inexpensive",
    PRICE_LEVEL_MODERATE: "Moderate Price",
    PRICE_LEVEL_EXPENSIVE: "Expensive",
    PRICE_LEVEL_VERY_EXPENSIVE: "Very Expensive",
  };
  if (priceLevel && levelMap[priceLevel]) return levelMap[priceLevel];
  return "No price data available";
}

const ZOOM_THRESHOLD = 10;

export default function Page() {
  const [location, setLocation] = useState("");
  const [polygon, setPolygon] = useState<{lat: number, lng: number}[]>([]);
  const [isPolygonValid, setIsPolygonValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [placeCount, setPlaceCount] = useState<number | null>(null);
  const [clearPolygon, setClearPolygon] = useState(false);
  const [resetView, setResetView] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number } | null>(null);

  // Decouple expensive map prop updates from the input's controlled value
  const deferredLocation = useDeferredValue(location);
  const [, startTransition] = useTransition();

  // Viewport tracking state
  const [zoom, setZoom] = useState<number>(4);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [hoveredRestaurantId, setHoveredRestaurantId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<CategoryId[]>(DEFAULT_SELECTED_CATEGORIES);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showClusters, setShowClusters] = useState(true);

  const canToggleClusters = zoom >= ZOOM_THRESHOLD && !showHeatmap;
  const effectiveClusters = canToggleClusters ? showClusters : !showHeatmap;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const { resolvedTheme, setTheme } = useTheme();
  
  // Handlers for map viewport changes
  const handleZoomChange = useCallback((newZoom: number) => {
    console.log('[map] zoom:', newZoom);
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
        longitude <= bounds.east &&
        matchesAnyCategory(restaurant.rating, restaurant.reviews, selectedCategories)
      );
    }).sort((a, b) => {
      // Sort by rating (descending), then by reviews (descending)
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.reviews - a.reviews;
    });
  }, [restaurants, zoom, bounds, selectedCategories]);
  
  const showRestaurantList = zoom >= ZOOM_THRESHOLD && visibleRestaurants.length > 0;

  // Filter all restaurants by selected categories (for map markers)
  const filteredRestaurants = useMemo(() => {
    return restaurants.filter(r => matchesAnyCategory(r.rating, r.reviews, selectedCategories));
  }, [restaurants, selectedCategories]);

  // Fetch restaurant data from backend API
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const { minRating, minReviews } = getWidestFetchParams(CATEGORIES);
        const res = await fetch(`${apiUrl}/places?minRating=${minRating}&minReviews=${minReviews}`);
        
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
          priceLevel?: string;
        }) => ({
          place_id: place.place_id,
          name: place.name,
          rating: place.rating,
          reviews: place.reviews,
          gps_coordinates: { latitude: place.lat, longitude: place.lng },
          cuisine: place.cuisine || "Restaurant",
          priceRange: formatPrice(place.priceMin, place.priceMax, place.priceLevel),
        }));
        
        setRestaurants(restaurants);
      } catch (error) {
        console.error('Error fetching restaurants:', error);
      }
    };

    fetchRestaurants();
  }, [apiUrl]);

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
        if (data.mock) setMockMode(true);
        if (data.usage) setUsageInfo(data.usage);
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
        if (data.mock) setMockMode(true);
        // Convert backend response to Restaurant format
        const newRestaurants: Restaurant[] = (data.places || [])
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
            priceLevel?: string;
          }) => ({
            place_id: place.placeId,
            name: place.displayName,
            rating: place.rating,
            reviews: place.userRatingCount,
            gps_coordinates: { latitude: place.lat, longitude: place.lng },
            cuisine: place.primaryTypeDisplayName || 'Restaurant',
            priceRange: formatPrice(place.priceMin, place.priceMax, place.priceLevel),
          }));
        
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
    <div className="flex h-screen bg-background relative overflow-hidden">
      <button
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        className="absolute top-3 left-3 z-50 w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
        aria-label="Toggle theme"
      >
        {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      {mockMode && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2.5 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/80 dark:border-amber-800/40">
          <FlaskConical className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">MOCK MODE</span>
          <span className="w-px h-3 bg-amber-300 dark:bg-amber-700 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">Data is simulated</span>
        </div>
      )}
      <div style={{ width: `${LEFT_SIDEBAR_FRACTION * 100}%` }} className={`absolute left-0 ${mockMode ? 'top-8' : 'top-0'} bottom-0 p-8 bg-white/10 dark:bg-[oklch(0.103_0.021_268)]/80 backdrop-blur-xl border-r border-black/10 dark:border-primary/40 z-10 flex items-center justify-center`}>
        <div className="w-full max-w-lg">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-6xl font-bold text-foreground">
              TopSpots
            </h1>
            <div className="flex items-center gap-1">
              {zoom > 4 && (
                <button
                  onClick={() => setResetView(true)}
                  className="w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Home"
                >
                  <Home className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => setHelpOpen(true)}
                className="w-8 h-8 rounded-full border-2 border-zinc-400 text-zinc-600 hover:border-zinc-600 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:text-zinc-200 flex items-center justify-center text-lg font-semibold transition-colors"
                aria-label="Help"
              >
                ?
              </button>
            </div>
          </div>
          <div className="text-m text-muted-foreground mb-4">
            Zoom in or search for an area to conduct your own search
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Search Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter city or address..."
                className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-foreground dark:bg-secondary/60 dark:border-border dark:text-foreground dark:placeholder-muted-foreground"
              />
            </div>

            <CategoryFilter
              selected={selectedCategories}
              onChange={(cats) => startTransition(() => setSelectedCategories(cats))}
            />

            <div className="flex gap-2">
              <Toggle
                pressed={showHeatmap}
                onPressedChange={(on) => { setShowHeatmap(on); if (on) setShowClusters(false); }}
                variant="outline"
                size="sm"
                className="flex-1 gap-2 cursor-pointer border-zinc-400 dark:border-zinc-500 hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-600 hover:text-white hover:border-orange-500 dark:hover:border-orange-500 data-[state=on]:bg-gradient-to-r data-[state=on]:from-orange-500 data-[state=on]:to-red-600 data-[state=on]:text-white data-[state=on]:border-orange-500"
              >
                <Flame className="w-4 h-4" />
                Heatmap
              </Toggle>
              <Toggle
                pressed={showClusters}
                onPressedChange={setShowClusters}
                disabled={!canToggleClusters}
                variant="outline"
                size="sm"
                className="flex-1 gap-2 cursor-pointer border-zinc-400 dark:border-zinc-500"
              >
                <CircleDotDashed className="w-4 h-4" />
                Clusters
              </Toggle>
            </div>

            {location && (
              <div className={`p-4 border rounded-lg ${
                polygon.length === 4 && isPolygonValid
                  ? 'bg-green-50 border-green-200 dark:bg-emerald-950/40 dark:border-emerald-800/50'
                  : polygon.length === 4 && !isPolygonValid
                  ? 'bg-orange-50 border-orange-300 dark:bg-orange-950/40 dark:border-orange-800/50'
                  : 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800/50'
              }`}>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-1">
                  Click <span className="font-semibold">4 points</span> on the map
                </p>
                <p className="text-sm text-muted-foreground">
                  Points selected: <span className="font-semibold">{polygon.length}/4</span>
                </p>
              </div>
            )}

            {polygon.length === 4 && !isPolygonValid && (
              <div className="p-4 bg-orange-50 border border-orange-300 dark:bg-orange-950/40 dark:border-orange-800/50 rounded-lg">
                <p className="text-sm text-orange-700 dark:text-orange-400 font-medium">
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
          location={deferredLocation}
          onPolygonChange={setPolygon}
          onPolygonValidation={setIsPolygonValid}
          clearPolygon={clearPolygon}
          onPolygonCleared={() => setClearPolygon(false)}
          isLocked={false}
          centerOffset={-7}
          restaurants={filteredRestaurants}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          onBoundsChange={handleBoundsChange}
          hoveredRestaurantId={hoveredRestaurantId}
          rightSidebarVisible={showRestaurantList}
          resetView={resetView}
          onViewReset={() => setResetView(false)}
          showHeatmap={showHeatmap}
          showClusters={effectiveClusters}
          theme={resolvedTheme as 'light' | 'dark' | undefined}
        />
      </div>

      {/* Restaurant List Panel - appears when zoomed in */}
      <div
        style={{ width: `${RIGHT_SIDEBAR_FRACTION * 100}%` }}
        className={`
          absolute right-0 top-0 bottom-0
          bg-white/10 dark:bg-[oklch(0.103_0.021_268)]/80 backdrop-blur-xl
          border-l border-black/10 dark:border-primary/40
          transition-transform duration-300 ease-out
          ${showRestaurantList ? 'translate-x-0' : 'translate-x-full'}
          z-20 flex flex-col
        `}
      >
        {/* Panel Header */}
        <div className="p-4 border-b border-black/10 dark:border-primary/40">
          <h2 className="text-lg font-semibold text-foreground">
            {selectedCategories.length === 1 && selectedCategories[0] === 'topspots'
              ? 'TopSpots in View'
              : 'Restaurants in View'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {visibleRestaurants.length} restaurant{visibleRestaurants.length !== 1 ? 's' : ''} • {CATEGORIES.filter(c => selectedCategories.includes(c.id)).map(c => c.label).join(', ')}
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
                    relative p-3 rounded-lg border cursor-pointer
                    transition-all duration-150 ease-out
                    ${isHovered
                      ? 'bg-white/40 border-black/20 shadow-md dark:bg-primary/40 dark:border-primary/70 dark:shadow-lg dark:shadow-black/40'
                      : 'bg-white/20 border-black/10 hover:bg-white/35 hover:border-black/20 dark:bg-[oklch(0.108_0.020_270)]/60 dark:border-primary/30 dark:hover:bg-secondary/60 dark:hover:border-primary/55'
                    }
                  `}
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    hoverTimeoutRef.current = setTimeout(() => setHoveredRestaurantId(restaurant.place_id), 15);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    hoverTimeoutRef.current = null;
                    setHoveredRestaurantId(null);
                  }}
                  onClick={() => window.open(googleMapsUrl, '_blank')}
                >
                  {restaurant.reviews >= 10000 && (
                    <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                      Popular
                    </span>
                  )}
                  <h3 className={`font-semibold text-foreground text-sm leading-snug mb-1${restaurant.reviews >= 10000 ? ' pr-14' : ''}`}>
                    {restaurant.name}
                  </h3>
                  
                  <div className="text-xs text-muted-foreground mb-2">
                    {restaurant.cuisine || 'Restaurant'}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span className="font-medium text-foreground">
                        {restaurant.rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(Math.floor(restaurant.reviews / 100) * 100).toLocaleString()}+ reviews
                    </div>
                  </div>
                  
                  {restaurant.priceRange && (
                    <div className="mt-2 text-xs text-muted-foreground">
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
            <DialogTitle>Search Results{mockMode ? ' (Mock)' : ''}</DialogTitle>
            <DialogDescription>
              {mockMode
                ? 'Simulated results — no real API calls were made'
                : "Here's what we found in your selected area"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className={`p-4 border rounded-lg ${mockMode ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/50' : 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800/50'}`}>
              <p className="text-2xl font-bold text-foreground text-center">
                {placeCount !== null ? placeCount : '—'}
              </p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                places found in this area
              </p>
            </div>

            {usageInfo && !mockMode && (() => {
              const { used, limit } = usageInfo;
              const count = placeCount ?? 0;
              const afterSearch = used + count;
              const overLimit = afterSearch > limit;
              const overBy = afterSearch - limit;
              const pct = Math.min((used / limit) * 100, 100);
              const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Monthly API usage</span>
                    <span className="font-medium text-foreground">{used.toLocaleString()} / {limit.toLocaleString()} free calls</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  {count > 0 && (
                    overLimit ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        ⚠ This search uses ~{count} calls — {overBy} over your free tier
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ This search uses ~{count} calls — fits within your free tier
                      </p>
                    )
                  )}
                </div>
              );
            })()}

            <Button
              variant="outline"
              className={`w-full ${!process.env.NEXT_PUBLIC_DEV_KEY ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!process.env.NEXT_PUBLIC_DEV_KEY}
              title={!process.env.NEXT_PUBLIC_DEV_KEY ? "Search is disabled in this demo" : undefined}
              onClick={process.env.NEXT_PUBLIC_DEV_KEY ? handleCollectPlaces : undefined}
            >
              Find TopSpots
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Welcome to TopSpots</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <p className="text-muted-foreground">
              Check out places we&apos;ve already found, or add places in your own search area by defining a polygon
            </p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
