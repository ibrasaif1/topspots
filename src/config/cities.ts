export interface CityConfig {
  id: string;
  name: string;
  displayName: string;
  image: string;
  polygon: {
    latitude: number;
    longitude: number;
  }[];
  highRatedCount?: number; // Hardcoded count for 4.5+ rated restaurants
}

export const SUPPORTED_CITIES: CityConfig[] = [
  {
    id: "san_francisco", 
    name: "San Francisco",
    displayName: "San Francisco, CA",
    image: "/san_francisco.jpg",
    polygon: [
      { latitude: 37.8199, longitude: -122.5194 }, // Northwest
      { latitude: 37.8199, longitude: -122.3482 }, // Northeast
      { latitude: 37.7049, longitude: -122.3482 }, // Southeast
      { latitude: 37.7049, longitude: -122.5194 }, // Southwest
    ]
  },
  {
    id: "denver",
    name: "Denver", 
    displayName: "Denver, CO",
    image: "/denver.jpg",
    polygon: [
      { latitude: 39.7817, longitude: -105.0178 }, // Northwest
      { latitude: 39.7817, longitude: -104.8758 }, // Northeast
      { latitude: 39.6143, longitude: -104.8758 }, // Southeast
      { latitude: 39.6143, longitude: -105.0178 }, // Southwest
    ]
  },
  {
    id: "san_diego",
    name: "San Diego",
    displayName: "San Diego, CA", 
    image: "/san_diego.jpg",
    polygon: [
      { latitude: 32.879093807300976, longitude: -116.99997765601691 }, // Northeast
      { latitude: 32.87810316287134, longitude: -117.29463345571241 }, // Northwest
      { latitude: 32.53569902520681, longitude: -117.26781167494963 }, // Southwest
      { latitude: 32.557967971135284, longitude: -116.9042361372558 }, // Southeast
    ],
    highRatedCount: 3005
  }
];

export function getCityById(id: string): CityConfig | undefined {
  return SUPPORTED_CITIES.find(city => city.id === id);
}

export function getCityByName(name: string): CityConfig | undefined {
  return SUPPORTED_CITIES.find(city => 
    city.name.toLowerCase() === name.toLowerCase() || 
    city.displayName.toLowerCase() === name.toLowerCase()
  );
}