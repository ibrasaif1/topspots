"use client";

import React from "react";

interface AddCityCardProps {
  onClick: () => void;
}

export default function AddCityCard({ onClick }: AddCityCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-3xl shadow-xl hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-95 active:scale-90 border border-blue-100 border-dashed"
    >
      <div className="aspect-video rounded-t-3xl overflow-hidden bg-gray-50 flex items-center justify-center">
        <svg
          className="w-16 h-16 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>
      
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-500 mb-2">Add City</h2>
        <span className="text-sm text-gray-400">Click to add a new city</span>
      </div>
    </div>
  );
}