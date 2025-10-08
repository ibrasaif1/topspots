"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { getCityByName } from "@/config/cities";

interface CityCardProps {
  name: string;
  image: string;
  onClick: (cityName: string) => void;
}

function CityRestaurantCount({ cityName }: { cityName: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cityConfig = getCityByName(cityName);
    
    if (cityConfig?.highRatedCount) {
      setCount(cityConfig.highRatedCount);
    } else {
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

export default function CityCard({ name, image, onClick }: CityCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={() => onClick(name)}
      className="bg-white rounded-3xl shadow-xl hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-95 active:scale-90 border border-blue-100"
    >
      <div className="aspect-video rounded-t-3xl overflow-hidden bg-gray-200 relative">
        <Image
          src={imageError ? `https://placehold.co/400x225/e2e8f0/64748b?text=${encodeURIComponent(name)}` : image}
          alt={name}
          fill
          className="object-cover"
          onError={() => setImageError(true)}
        />
      </div>

      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{name}</h2>
        <CityRestaurantCount cityName={name} />
      </div>
    </div>
  );
}