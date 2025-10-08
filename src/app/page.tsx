"use client";

import React, { Suspense } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import RestaurantList from "../components/RestaurantList";
import CityCard from "../components/CityCard";
import AddCityCard from "../components/AddCityCard";

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


function LandingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedCity = searchParams.get('city');
  

  const handleCityClick = (cityName: string) => {
    router.push(`/?city=${encodeURIComponent(cityName)}`);
  };

  const handleAddCityClick = () => {
    router.push('/add-city');
  };




  if (selectedCity) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50">
        <header className="flex-shrink-0 z-20 bg-white/80 backdrop-blur border-b border-blue-100">
          <div className="px-4 py-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">TopSpots</h1>
              <h2 className="text-lg text-gray-600">{selectedCity}</h2>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-hidden px-4 py-4">
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
          Discover the highest-rated restaurants in your city, exclusively featuring establishments with 4.5+ stars and 1,000+ verified Google reviews
        </motion.p>

        <div className={`grid grid-cols-1 gap-8 ${cities.length >= 2 ? 'md:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto' : 'md:grid-cols-3'} mb-8`}>
          {cities.map((city) => (
            <CityCard
              key={city.name}
              name={city.name}
              image={city.image}
              onClick={handleCityClick}
            />
          ))}
          <AddCityCard onClick={handleAddCityClick} />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
      <div className="text-xl text-gray-600">Loading...</div>
    </div>}>
      <LandingPageContent />
    </Suspense>
  );
}