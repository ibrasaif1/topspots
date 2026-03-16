import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if a polygon is drawn in counter-clockwise order using the Shoelace formula
 * @param points Array of lat/lng coordinates
 * @returns true if counter-clockwise, false if clockwise
 */
export function isCounterClockwise(points: {lat: number, lng: number}[]): boolean {
  if (points.length < 3) return true; // Not enough points to form a polygon

  let signedArea = 0;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];

    // Shoelace formula: Σ(x[i] * y[i+1] - x[i+1] * y[i])
    signedArea += (current.lng * next.lat) - (next.lng * current.lat);
  }

  // Positive signed area = counter-clockwise
  // Negative signed area = clockwise
  return signedArea > 0;
}