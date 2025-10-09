"use client";

import { useState, useEffect } from "react";
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

export default function AddCityPage() {
  const [location, setLocation] = useState("");
  const [polygon, setPolygon] = useState<{lat: number, lng: number}[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [result, setResult] = useState<{count: number, cost: number} | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  // Fetch restaurant data for Austin and San Diego
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const cities = ['austin', 'san_diego'];
        const allRestaurants: Restaurant[] = [];

        for (const city of cities) {
          try {
            const res = await fetch(`/${city}_restaurants.json`, { cache: "no-store" });
            if (res.ok) {
              const data = await res.json();

              let cityRestaurants: Restaurant[] = [];

              if (Array.isArray(data)) {
                cityRestaurants = data;
              } else if (data.places && Array.isArray(data.places)) {
                cityRestaurants = data.places.map((place: any) => ({
                  place_id: place.placeId || place.id,
                  name: place.name,
                  rating: place.rating || 0,
                  reviews: place.userRatingCount || 0,
                  gps_coordinates: place.location || { latitude: 0, longitude: 0 },
                  cuisine: place.primaryTypeDisplayName || place.primaryType || "Restaurant",
                  priceRange: derivePriceRangeLabel(place.priceRange)
                }));
              }

              // Filter to only show places with 1000+ reviews
              const filtered = cityRestaurants.filter(r => r.reviews >= 1000);
              allRestaurants.push(...filtered);
            }
          } catch (error) {
            console.warn(`Failed to load ${city} restaurants:`, error);
          }
        }

        setRestaurants(allRestaurants);
      } catch (error) {
        console.error('Error fetching restaurants:', error);
      }
    };

    fetchRestaurants();
  }, []);

  const handleCountCall = async () => {
    setLoading(true);

    try {
      setModalOpen(true)

      // Close the polygon by adding first point as last
      // const closedPolygon = [...polygon, polygon[0]];

      // const response = await fetch('/api/count', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     polygon: closedPolygon.map(p => ({
      //       latitude: p.lat,
      //       longitude: p.lng
      //     }))
      //   })
      // });

      // const data = await response.json();

      // if (data.ok) {
      //   setResult({
      //     count: data.restaurantCount,
      //     cost: data.estimatedCost
      //   });
      //   setModalOpen(true);
      // } else {
      //   alert(`Error: ${data.error}`);
      // }
    } catch (error) {
      alert('Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 relative">
      <div className="absolute left-0 top-0 bottom-0 w-1/3 p-8 bg-white/10 backdrop-blur-xl border-r border-white/20 z-10 flex items-center justify-center">
        <div className="w-full max-w-md">
          <h1 className="text-6xl font-bold text-slate-900 mb-6">
            Add New City
          </h1>

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
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
              />
            </div>

            {location && (
              <div className={`p-4 border rounded-lg ${
                polygon.length === 4
                  ? 'bg-green-50 border-green-200'
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

            <Button
              onClick={handleCountCall}
              disabled={polygon.length !== 4 || loading || process.env.NEXT_PUBLIC_APP_ENV == 'production'}
              className="w-full"
            >
              {loading ? 'Loading...' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full h-full">
        <GoogleMapsEmbed
          location={location}
          onPolygonChange={setPolygon}
          clearPolygon={false}
          onPolygonCleared={() => {}}
          isLocked={false}
          centerOffset={-7}
          restaurants={restaurants}
        />
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search Results</DialogTitle>
            <DialogDescription>
              Here's what we found in your selected area
            </DialogDescription>
          </DialogHeader>

          {
            <div className="space-y-4 py-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-slate-700 mb-1">
                  Restaurants found: <span className="font-bold text-lg">8</span>
                </p>
                <p className="text-sm text-slate-700">
                  Estimated cost: <span className="font-bold text-lg">$10</span>
                </p>
              </div>

              <Button onClick={() => setModalOpen(false)} className="w-full">
                Close
              </Button>
            </div>
          }
        </DialogContent>
      </Dialog>
    </div>
  );
}
