"use client";

import React, { useState } from "react";
import { SUPPORTED_CITIES } from "@/config/cities";

export default function AdminPage() {
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [costEstimate, setCostEstimate] = useState<number | null>(null);
  const [result, setResult] = useState<{
    data?: { city: string; places: Record<string, unknown>[] };
    totalHydrated: number;
    elapsedSec: number;
    saved: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const estimateCost = async () => {
    if (!city.trim()) return;
    
    setEstimating(true);
    setError(null);
    
    try {
      // Get restaurant count for cost estimation
      const response = await fetch(`/api/count?city=${encodeURIComponent(city)}`);
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      
      const data = await response.json();
      const estimatedCost = data.estimatedCost || 0;
      
      setCostEstimate(estimatedCost);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to estimate cost");
      setCostEstimate(null);
    } finally {
      setEstimating(false);
    }
  };

  const fetchRestaurants = async () => {
    if (!city.trim()) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch(`http://localhost:5000/search?city=${encodeURIComponent(city)}`);
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      
      const data = await response.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch restaurants");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Restaurant Data Admin</h1>
        
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Add New City</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select City
              </label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">Choose a city...</option>
                {SUPPORTED_CITIES.map((cityConfig) => (
                  <option key={cityConfig.id} value={cityConfig.name}>
                    {cityConfig.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <button
                onClick={estimateCost}
                disabled={!city.trim() || estimating}
                className="px-6 py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {estimating ? "Estimating..." : "Estimate Cost"}
              </button>
              
              <button
                onClick={fetchRestaurants}
                disabled={!city.trim() || loading}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? "Fetching..." : "Fetch Restaurants"}
              </button>
            </div>

            {costEstimate !== null && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">
                  <span className="font-semibold">Estimated Cost:</span> ${costEstimate.toFixed(2)}
                </p>
                <p className="text-sm text-blue-600 mt-1">
                  Based on Google Places API pricing ($0.02 per place details call)
                </p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {result && (
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold text-green-800 mb-4">Success!</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-green-700">City:</span> {result.data?.city}
                  </div>
                  <div>
                    <span className="font-medium text-green-700">Total Places:</span> {result.totalHydrated}
                  </div>
                  <div>
                    <span className="font-medium text-green-700">Time Taken:</span> {result.elapsedSec}s
                  </div>
                  <div>
                    <span className="font-medium text-green-700">Saved To:</span> {result.saved}
                  </div>
                </div>
                
                {result.data?.places?.length > 0 && (
                  <div className="mt-4">
                    <p className="font-medium text-green-700 mb-2">Sample Restaurant:</p>
                    <pre className="bg-white p-3 rounded text-xs overflow-auto max-h-40">
                      {JSON.stringify(result.data.places[0], null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Testing Guide</h2>
          <div className="space-y-4 text-gray-700">
            <div>
              <h3 className="font-semibold text-gray-800">What to test:</h3>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Click &quot;Estimate Cost&quot; first to see API call cost</li>
                <li>Verify the sample restaurant has all required fields</li>
                <li>Check that gps_coordinates has latitude/longitude</li>
                <li>Ensure rating and userRatingCount are present</li>
                <li>Verify the saved file appears in backend/data/</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-800">Required Fields:</h3>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>name, rating, userRatingCount</li>
                <li>gps_coordinates.latitude, gps_coordinates.longitude</li>
                <li>primaryType, types, googleMapsUri</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}