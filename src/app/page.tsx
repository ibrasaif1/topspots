"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import RestaurantList from "../components/RestaurantList";
import { SUPPORTED_CITIES, getCityByName } from "@/config/cities";

const cities = [
  {
    name: "Austin",
    count: "2,200+",
    image: "/austin.jpg"
  },
  {
    name: "San Diego", 
    count: "1,800+",
    image: "/san_diego.jpg"
  }
];

function CityRestaurantCount({ cityName }: { cityName: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cityConfig = getCityByName(cityName);
    
    if (cityConfig?.highRatedCount) {
      // Use hardcoded count if available
      setCount(cityConfig.highRatedCount);
    } else {
      // Call API to get count
      setLoading(true);
      fetch(`/api/count?city=${encodeURIComponent(cityName)}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setCount(data.restaurantCount);
          }
        })
        .catch(err => console.error('Error fetching count:', err))
        .finally(() => setLoading(false));
    }
  }, [cityName]);

  if (loading) return <span className="text-sm text-gray-500">Loading count...</span>;
  if (count === null) return null;
  
  return <span className="text-sm text-gray-500">{count.toLocaleString()} restaurants (4.5+ stars)</span>;
}

export default function LandingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedCity = searchParams.get('city');
  
  const [newCityDropdown, setNewCityDropdown] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [costEstimate, setCostEstimate] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCityClick = (cityName: string) => {
    router.push(`/?city=${encodeURIComponent(cityName)}`);
  };

  const handleSelectCity = (cityName: string, displayName: string) => {
    setNewCityDropdown(cityName);
    setDropdownOpen(false);
    router.push(`/?city=${encodeURIComponent(cityName)}`);
  };

  const estimateCost = async () => {
    if (!newCityDropdown) return;
    
    setEstimating(true);
    setCostEstimate(null);
    
    try {
      const response = await fetch(`/api/count?city=${encodeURIComponent(newCityDropdown)}`);
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      
      const data = await response.json();
      const estimatedCost = data.estimatedCost || 0;
      
      setCostEstimate(estimatedCost);
    } catch (err: any) {
      console.error('Failed to estimate cost:', err);
      setCostEstimate(null);
    } finally {
      setEstimating(false);
    }
  };

  const selectedCityConfig = SUPPORTED_CITIES.find(city => city.name === newCityDropdown);
  
  // Filter out cities that are already displayed as cards
  const availableCities = SUPPORTED_CITIES.filter(cityConfig => 
    !cities.some(card => card.name === cityConfig.name)
  );

  if (selectedCity) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-blue-100">
          <div className="mx-auto max-w-7xl px-4 py-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">TopSpots</h1>
              <h2 className="text-lg text-gray-600">{selectedCity}</h2>
              <CityRestaurantCount cityName={selectedCity} />
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-4 py-8">
          <RestaurantList city={selectedCity} />
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex flex-col items-center justify-center p-5">
      <div className="max-w-4xl w-full text-center">
        <motion.h1 
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-6xl md:text-7xl font-black text-gray-900 mb-4"
        >
          TopSpots
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl md:text-2xl text-gray-700 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Discover the highest-rated restaurants in your city or plan your next trip powered by real Google Maps reviews and ratings
        </motion.p>

        {/* City cards container - this sets the width reference */}
        <div className={`grid grid-cols-1 gap-8 ${cities.length === 2 ? 'md:grid-cols-2 max-w-2xl mx-auto' : 'md:grid-cols-3'} mb-8`}>
          {cities.map((city, index) => (
            <div
              key={city.name}
              onClick={() => handleCityClick(city.name)}
              className="bg-white rounded-3xl shadow-xl hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-95 active:scale-90 border border-blue-100"
            >
              
              <div className="aspect-video rounded-t-3xl overflow-hidden bg-gray-200">
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = `https://placehold.co/400x225/e2e8f0/64748b?text=${encodeURIComponent(city.name)}`;
                  }}
                />
              </div>
              
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{city.name}</h2>
                <p className="text-gray-600 font-medium">{city.count} restaurants rated</p>
              </div>
            </div>
          ))}
        </div>

        {/* Dropdown container - disabled */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className={`${cities.length === 2 ? 'max-w-2xl' : 'max-w-4xl'} mx-auto`}
        >
          <div className="relative" ref={dropdownRef}>
            <button
              disabled
              className="px-6 py-3 bg-gray-100 text-gray-400 rounded-2xl w-full flex items-center justify-between border border-gray-200 cursor-not-allowed opacity-60"
            >
              <span className="font-medium">
                Add new city...
              </span>
              <svg
                className="w-5 h-5 ml-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}