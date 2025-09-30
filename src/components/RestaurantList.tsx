"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Wrapper } from "@googlemaps/react-wrapper";
import { getCityByName } from "@/config/cities";

// Declare google maps types for TypeScript
interface GoogleMapsBounds {
  extend: (position: { lat: number; lng: number }) => void;
}

interface GoogleMapsMarker {
  addListener: (event: string, callback: () => void) => void;
  setAnimation: (animation: unknown) => void;
  setIcon: (icon: Record<string, unknown>) => void;
  setMap: (map: unknown) => void;
}

interface GoogleMapsInfoWindow {
  close: () => void;
  open: (map: unknown, anchor: unknown) => void;
  setContent: (content: string | Node) => void;
}

interface GoogleMapsMap {
  fitBounds: (bounds: unknown, padding?: Record<string, number>) => void;
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
}

interface GoogleMapsPolygon {
  setMap: (map: unknown) => void;
}

declare global {
  interface Window {
    google: {
      maps: {
        Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapsMap;
        Marker: new (options: Record<string, unknown>) => GoogleMapsMarker;
        InfoWindow: new (options?: Record<string, unknown>) => GoogleMapsInfoWindow;
        LatLngBounds: new () => GoogleMapsBounds;
        Polygon: new (options: Record<string, unknown>) => GoogleMapsPolygon;
        Size: new (width: number, height: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        Animation: { BOUNCE: unknown };
      };
    };
  }
}
declare const google: typeof window.google;

type Restaurant = {
  place_id: string;
  name: string;
  rating: number;
  reviews: number;
  address: string;
  gps_coordinates: { latitude: number; longitude: number };
  image?: string; // retained in type for compatibility
  thumbnail?: string; // retained in type for compatibility
  price?: string;
  cuisine?: string;
  priceRange?: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const formatPriceLevel = (price?: string) => {
  if (!price) return "";

  const normalized = price.toUpperCase();
  const priceMap: Record<string, string> = {
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
    PRICE_LEVEL_ONE: "$",
    PRICE_LEVEL_TWO: "$$",
    PRICE_LEVEL_THREE: "$$$",
    PRICE_LEVEL_FOUR: "$$$$"
  };

  if (priceMap[normalized]) {
    return priceMap[normalized];
  }

  if (/^\$+/.test(price)) {
    return price;
  }

  return price;
};

type RawPriceAmount = {
  currencyCode?: string;
  units?: string | number;
  nanos?: string | number;
};

const formatPriceAmount = (amount?: RawPriceAmount) => {
  if (!amount) return "";

  const currency = typeof amount.currencyCode === "string" && amount.currencyCode.trim()
    ? amount.currencyCode
    : "USD";

  const parsedUnits = typeof amount.units === "string"
    ? Number(amount.units)
    : typeof amount.units === "number"
      ? amount.units
      : NaN;

  if (Number.isNaN(parsedUnits)) {
    return "";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  return formatter.format(parsedUnits);
};

const derivePriceRangeLabel = (priceRange: unknown): string => {
  if (!priceRange || typeof priceRange !== "object") return "";

  const { startPrice, endPrice } = priceRange as {
    startPrice?: RawPriceAmount;
    endPrice?: RawPriceAmount;
  };

  const start = formatPriceAmount(startPrice);
  const end = formatPriceAmount(endPrice);

  if (start && end) return `${start} - ${end}`;
  if (start) return `${start}+`;
  if (end) return `Up to ${end}`;
  return "";
};

const formatInfoContent = (restaurant: Restaurant) => {
  const ratingLine = restaurant.rating
    ? `⭐ ${restaurant.rating.toFixed(1)} · ${restaurant.reviews?.toLocaleString() ?? 0} reviews`
    : "";

  const priceLevel = formatPriceLevel(restaurant.price);
  const priceRange = restaurant.priceRange ?? "";

  const detailParts: string[] = [];
  if (restaurant.cuisine) detailParts.push(escapeHtml(restaurant.cuisine));
  if (priceLevel) detailParts.push(priceLevel);
  if (priceRange) detailParts.push(escapeHtml(priceRange));

  const address = restaurant.address && /^https?:\/\//i.test(restaurant.address)
    ? ""
    : restaurant.address;

  return `
    <div style="padding: 8px; max-width: 220px;">
      <div style="font-weight: 600; font-size: 14px; color: #1f2937;">${escapeHtml(restaurant.name)}</div>
      ${ratingLine ? `<div style="color: #6b7280; margin-top: 4px;">${ratingLine}</div>` : ""}
      ${detailParts.length ? `<div style="color: #4b5563; font-size: 12px; margin-top: 6px;">${detailParts.join(" · ")}</div>` : ""}
      ${address ? `<div style="color: #9ca3af; font-size: 12px; margin-top: 8px;">${escapeHtml(address)}</div>` : ""}
    </div>
  `;
};

function GoogleMap({ restaurants, hoveredRestaurant, onMarkerHover, city }: { 
  restaurants: Restaurant[], 
  hoveredRestaurant: string | null,
  onMarkerHover: (id: string | null) => void,
  city: string
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GoogleMapsMap | null>(null);
  const markersRef = useRef<{ [key: string]: GoogleMapsMarker }>({});
  const infoWindowRef = useRef<GoogleMapsInfoWindow | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 30.2672, lng: -97.7431 },
      zoom: 12,
      // Disable various controls
      streetViewControl: false,        // Removes Street View pegman
      fullscreenControl: false,        // Removes fullscreen button
      mapTypeControl: false,           // Removes Map/Satellite toggle
      zoomControl: true,               // Keep zoom controls
      gestureHandling: 'cooperative',  // Requires Ctrl+scroll to zoom
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        },
        // Add more custom styling
        {
          featureType: "transit",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    mapInstanceRef.current = map;

    // Create bounds to fit all restaurants
    const bounds = new google.maps.LatLngBounds();
    let hasValidCoordinates = false;

    const infoWindow = new google.maps.InfoWindow();
    infoWindowRef.current = infoWindow;
    let closeTimeout: number | null = null;

    restaurants.forEach((restaurant) => {
      if (!restaurant.gps_coordinates?.latitude || !restaurant.gps_coordinates?.longitude) return;

      const position = {
        lat: restaurant.gps_coordinates.latitude,
        lng: restaurant.gps_coordinates.longitude
      };

      // Add to bounds
      bounds.extend(position);
      hasValidCoordinates = true;

      const marker = new google.maps.Marker({
        position: position,
        map: map,
        title: restaurant.name,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#EF4444"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 24)
        }
      });

      const openInfoWindow = () => {
        if (closeTimeout) {
          window.clearTimeout(closeTimeout);
          closeTimeout = null;
        }
        const content = formatInfoContent(restaurant);
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
      };

      const scheduleCloseInfoWindow = () => {
        closeTimeout = window.setTimeout(() => {
          infoWindow.close();
          closeTimeout = null;
        }, 150);
      };

      marker.addListener('click', () => {
        openInfoWindow();
      });

      marker.addListener('mouseover', () => {
        onMarkerHover(restaurant.place_id);
        openInfoWindow();
      });

      marker.addListener('mouseout', () => {
        onMarkerHover(null);
        scheduleCloseInfoWindow();
      });

      markersRef.current[restaurant.place_id] = marker;
    });

    // Add search area polygon for cities that have coordinate data
    const cityConfig = getCityByName(city || "");
    if (cityConfig) {
      const polygon = new google.maps.Polygon({
        paths: cityConfig.polygon.map(coord => ({
          lat: coord.latitude,
          lng: coord.longitude
        })),
        strokeColor: "#3B82F6",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#3B82F6",
        fillOpacity: 0.1,
      });
      polygon.setMap(map);
      
      // If we have polygon data, fit the map to show the polygon area
      const polygonBounds = new google.maps.LatLngBounds();
      cityConfig.polygon.forEach(coord => {
        polygonBounds.extend({ lat: coord.latitude, lng: coord.longitude });
      });
      map.fitBounds(polygonBounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }

    // Fit map to show restaurants if available, otherwise show polygon area
    if (hasValidCoordinates) {
      map.fitBounds(bounds, {
        top: 10,
        right: 10,
        bottom: 10,
        left: 10
      });
    } else if (!cityConfig) {
      // Fallback to Austin center if no data
      map.setCenter({ lat: 30.2672, lng: -97.7431 });
      map.setZoom(12);
    }

    return () => {
      if (closeTimeout) {
        window.clearTimeout(closeTimeout);
        closeTimeout = null;
      }
      Object.values(markersRef.current).forEach(marker => marker.setMap(null));
      markersRef.current = {};
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
        infoWindowRef.current = null;
      }
    };
  }, [restaurants, onMarkerHover, city]);

  // Handle marker highlighting when hovering over restaurant list
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([placeId, marker]) => {
      const isHovered = hoveredRestaurant === placeId;
      
      if (isHovered) {
        // Make marker bounce
        marker.setAnimation(google.maps.Animation.BOUNCE);
        
        // Change to highlighted icon
        marker.setIcon({
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#3B82F6"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(32, 32),
          anchor: new google.maps.Point(16, 32)
        });
      } else {
        // Stop bouncing
        marker.setAnimation(null);
        
        // Restore normal icon
        marker.setIcon({
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#EF4444"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 24)
        });
      }
    });
  }, [hoveredRestaurant]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

export default function RestaurantList({ city }: { city?: string }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [hoveredRestaurant, setHoveredRestaurant] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Convert city name to filename format (lowercase, spaces to underscores)
        const filename = city?.toLowerCase().replace(/\s+/g, '_') || 'austin';
        const res = await fetch(`/${filename}_restaurants.json`, { cache: "no-store" });
        if (!res.ok) {
          // If no restaurant data found, just show empty array
          setRestaurants([]);
        } else {
          const data = await res.json();
          // Handle both old format (array) and new format (object with places property)
          if (Array.isArray(data)) {
            setRestaurants(data);
          } else if (data.places && Array.isArray(data.places)) {
            // Convert new format to old format for compatibility
            const convertedRestaurants = data.places.map((place: Record<string, unknown>) => ({
              place_id: (place.placeId as string) || (place.id as string),
              name: place.name as string,
              rating: (place.rating as number) || 0,
              reviews: (place.userRatingCount as number) || 0,
              address: (place.googleMapsUri as string) || "",
              gps_coordinates: (place.location as { latitude: number; longitude: number }) || { latitude: 0, longitude: 0 },
              price: place.priceLevel as string,
              cuisine: (place.primaryTypeDisplayName as string) || (place.primaryType as string) || "Restaurant",
              priceRange: derivePriceRangeLabel(place.priceRange)
            }));
            setRestaurants(convertedRestaurants);
          } else {
            setRestaurants([]);
          }
        }
      } catch {
        // If file doesn't exist, show empty restaurants but no error
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [city]);

  const items = useMemo(() => {
    // Filter to only show places with 1000+ user ratings
    const filtered = restaurants.filter(restaurant => restaurant.reviews >= 1000);
    
    // Sort by rating (descending), then by user rating count (descending)
    return filtered.sort((a, b) => {
      // First sort by rating (higher is better)
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      // If ratings are equal, sort by review count (more is better)
      return b.reviews - a.reviews;
    });
  }, [restaurants]);
  

  if (loading) return <div className="text-center text-neutral-600">Loading…</div>;
  if (error) return <div className="text-center text-red-600">{error}</div>;

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-3 text-sm text-neutral-600">Showing {items.length.toLocaleString()} places</div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Map */}
        <div className="lg:sticky lg:top-24 h-[700px] bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <Wrapper apiKey={process.env.NEXT_PUBLIC_FRONTEND_API_KEY || ""} render={() => <div />}>
            <GoogleMap 
              restaurants={items}
              hoveredRestaurant={hoveredRestaurant}
              onMarkerHover={setHoveredRestaurant}
              city={city || ""}
            />
          </Wrapper>
        </div>

        {/* Restaurant List */}
        <div className="lg:sticky lg:top-24 h-[700px] bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="h-full overflow-y-auto p-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {items.map((r) => {
                const isHovered = hoveredRestaurant === r.place_id;
                return (
                  <article
                    key={r.place_id}
                    className={
                      "group relative rounded-lg border overflow-hidden cursor-pointer flex flex-col transition-all duration-200 ease-out " +
                      (isHovered 
                        ? "bg-blue-50 border-blue-300 shadow-md ring-1 ring-blue-200" 
                        : "bg-white border-neutral-200 hover:border-blue-300 hover:shadow-md hover:ring-1 hover:ring-blue-200")
                    }
                    onMouseEnter={() => setHoveredRestaurant(r.place_id)}
                    onMouseLeave={() => setHoveredRestaurant(null)}
                    onClick={() => {
                      // Extract clean place ID (remove "places/" prefix if present)
                      const cleanPlaceId = r.place_id.replace('places/', '');
                      window.open(
                        `https://www.google.com/maps/place/?q=place_id:${cleanPlaceId}`,
                        '_blank'
                      );
                    }}
                  >
                    <div className="p-3">
                      <h3 className="font-semibold text-sm leading-snug break-words text-gray-900 mb-1" title={r.name}>
                        {r.name}
                      </h3>
                      <div className="text-xs text-gray-600 truncate mb-2" title={r.cuisine || "Restaurant"}>
                        {r.cuisine || "Restaurant"}
                      </div>
                      
                      <div className="flex justify-between items-end">
                        <div className="text-sm text-gray-900 leading-tight tabular-nums font-medium">
                          ⭐ {r.rating?.toFixed(1) ?? "-"}
                        </div>
                        <div className="text-xs text-gray-500">{Number(r.reviews || 0).toLocaleString()}</div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
