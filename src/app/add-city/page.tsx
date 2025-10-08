"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import GoogleMapsEmbed from "../../components/GoogleMapsEmbed";

export default function AddCityPage() {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [costData, setCostData] = useState<{
    count: number;
    cost: number;
  } | null>(null);
  const [polygon, setPolygon] = useState<{lat: number, lng: number}[]>([]);
  const [apiPayload, setApiPayload] = useState<any>(null);
  const [clearPolygon, setClearPolygon] = useState(false);
  const [isPolygonLocked, setIsPolygonLocked] = useState(false);
  const [countResults, setCountResults] = useState<{count: number, cost: number} | null>(null);
  const [lockedPolygon, setLockedPolygon] = useState<{lat: number, lng: number}[]>([]);

  // Feature flag: true = dev mode (mock data), false = paid mode (real API)
  const isDevMode = process.env.NEXT_PUBLIC_APP_ENV !== 'production';

  const handleCalculateCost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (polygon.length !== 4) {
      alert("Please click 4 points on the map to create your search polygon");
      return;
    }

    setLoading(true);

    try {
      // Close the polygon by adding first point as last
      const closedPolygon = [...polygon, polygon[0]];

      // Generate API payload
      const payload = {
        insights: ['INSIGHT_COUNT'],
        filter: {
          locationFilter: {
            customArea: {
              polygon: {
                coordinates: closedPolygon.map(p => ({
                  latitude: p.lat,
                  longitude: p.lng
                }))
              }
            }
          },
          typeFilter: { includedTypes: ["restaurant"] },
          ratingFilter: { minRating: 4.5, maxRating: 5.0 },
          operatingStatus: ['OPERATING_STATUS_OPERATIONAL']
        }
      };

      let data;

      if (isDevMode) {
        // DEV MODE: Mock response without API call
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
        data = {
          ok: true,
          restaurantCount: 147,
          estimatedCost: 2.94
        };
      } else {
        // PAID MODE: Real API call
        const response = await fetch('/api/count', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            polygon: closedPolygon.map(p => ({ latitude: p.lat, longitude: p.lng }))
          })
        });
        data = await response.json();
      }

      if (data.ok) {
        // Lock the polygon and save results
        setIsPolygonLocked(true);
        setLockedPolygon([...polygon]);
        setCountResults({
          count: data.restaurantCount,
          cost: data.estimatedCost
        });
        setApiPayload(payload);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Error calling COUNT API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push("/");
  };

  const handleClearPolygon = () => {
    setClearPolygon(true);
    setPolygon([]);
    setApiPayload(null);
  };

  const handleResetArea = () => {
    // Unlock and clear everything
    setIsPolygonLocked(false);
    setLockedPolygon([]);
    setCountResults(null);
    setApiPayload(null);
    setClearPolygon(true);
    setPolygon([]);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50">
      <header className="flex-shrink-0 z-20 bg-white/80 backdrop-blur border-b border-blue-100">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">TopSpots</h1>
              <h2 className="text-lg text-gray-600">Add New City</h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="flex-1 overflow-hidden px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100 overflow-hidden h-full"
          >
            {location && (
              <div className="h-full flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  Map Preview - Click 4 Points
                </h3>
                <div className="flex-1 min-h-0">
                  <GoogleMapsEmbed
                    location={location}
                    onPolygonChange={setPolygon}
                    clearPolygon={clearPolygon}
                    onPolygonCleared={() => setClearPolygon(false)}
                    isLocked={isPolygonLocked}
                    showExistingPins={true}
                  />
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white rounded-3xl shadow-xl p-8 border border-blue-100 overflow-y-auto h-full"
          >
            <h3 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              Add a New City
            </h3>
            
            <form onSubmit={handleCalculateCost} className="space-y-6">
              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                  Search Location (to center map)
                </label>
                <input
                  type="text"
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter address, city, or landmark..."
                />
              </div>

              {location && !isPolygonLocked && (
                isDevMode ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-blue-800">Instructions</h4>
                      {polygon.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearPolygon}
                          className="text-xs px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Clear Points
                        </button>
                      )}
                    </div>
                    <p className="text-blue-700 text-sm mb-2">
                      Click <strong>4 points</strong> on the map to create your search polygon
                    </p>
                    <p className="text-blue-700 text-sm mb-2">
                      Points selected: <strong>{polygon.length}/4</strong>
                    </p>
                    {polygon.length > 0 && (
                      <div className="bg-blue-100 rounded-lg p-2 mb-2">
                        <p className="text-xs font-semibold text-blue-800 mb-1">Coordinates (GeoJSON format):</p>
                        <pre className="text-xs text-blue-700 font-mono whitespace-pre-wrap">
{[...polygon, polygon.length === 4 ? polygon[0] : null].filter(p => p !== null).map((point, index) =>
  `            [\n              ${point.lng.toFixed(6)},\n              ${point.lat.toFixed(6)}\n            ]${index < (polygon.length === 4 ? polygon.length : polygon.length - 1) ? ',' : ''}`
).join('\n')}
                        </pre>
                      </div>
                    )}
                    <p className="text-blue-600 text-xs mt-1">
                      ⚠️ Click points in clockwise or counter-clockwise order (no crossing lines)
                    </p>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-yellow-800">🚧 Coming Soon</h4>
                      {polygon.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearPolygon}
                          className="text-xs px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Clear Points
                        </button>
                      )}
                    </div>
                    <p className="text-yellow-700 text-sm mb-2">
                      Click <strong>4 points</strong> on the map to define your search area
                    </p>
                    <p className="text-yellow-700 text-sm">
                      Points selected: <strong>{polygon.length}/4</strong>
                    </p>
                    <p className="text-yellow-600 text-xs mt-2">
                      Search functionality is still under development. Check back soon!
                    </p>
                  </div>
                )
              )}

              {countResults && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h4 className="font-semibold text-green-800 mb-3">Search Results</h4>
                  <p className="text-green-700 text-sm mb-1">
                    Found: <strong>{countResults.count.toLocaleString()}</strong> restaurants (4.5+ stars)
                  </p>
                  <p className="text-green-700 text-sm">
                    Estimated cost: <strong>${countResults.cost.toFixed(2)}</strong>
                  </p>
                </div>
              )}

              {apiPayload && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <h4 className="font-semibold text-purple-800 mb-2">API Request Body</h4>
                  <div className="text-xs text-purple-700 mb-2">
                    <div><strong>URL:</strong> https://areainsights.googleapis.com/v1:computeInsights</div>
                    <div><strong>Method:</strong> POST</div>
                  </div>
                  <pre className="bg-purple-100 p-3 rounded-lg text-xs overflow-x-auto text-purple-800">
{JSON.stringify(apiPayload, null, 2)}
                  </pre>
                </div>
              )}

              {costData && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h4 className="font-semibold text-green-800 mb-2">Cost Calculation Results</h4>
                  <p className="text-green-700">
                    Found <strong>{costData.count.toLocaleString()}</strong> restaurants (4.5+ stars)
                  </p>
                  <p className="text-green-700">
                    Estimated cost: <strong>${costData.cost.toFixed(2)}</strong>
                  </p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                {!isPolygonLocked ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={polygon.length !== 4 || loading || !isDevMode}
                      className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium cursor-pointer"
                    >
                      {loading ? 'Calculating...' : 'Calculate Cost'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleResetArea}
                      className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium cursor-pointer"
                    >
                      Reset & Adjust Area
                    </button>
                    <button
                      type="button"
                      onClick={() => alert('Collect Places - Coming soon!')}
                      className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium cursor-pointer"
                    >
                      Collect Places →
                    </button>
                  </>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
