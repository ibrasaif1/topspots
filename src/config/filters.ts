// Shared place types for Google Places API calls

export const PLACE_TYPES = [
  'restaurant'
] as const;

// Category filter definitions

export type CategoryId = 'topspots' | 'hidden-gems' | 'on-the-come-up';

export interface CategoryConfig {
  id: CategoryId;
  label: string;
  description: string;
  minRating: number;
  minReviews: number;
  maxReviews?: number;
  match?: (rating: number, reviews: number) => boolean;
}

export const CATEGORIES: CategoryConfig[] = [
  { id: 'topspots', label: 'TopSpots', description: '4.5★+ • 1000+ reviews', minRating: 4.5, minReviews: 1000 },
  { id: 'hidden-gems', label: 'Hidden Gems', description: '4.8★+ • 500-999 reviews', minRating: 4.8, minReviews: 500, maxReviews: 999 },
  {
    id: 'on-the-come-up',
    label: 'On The Come Up',
    description: '4.5★+ • <500 reviews, or 4.5-4.7★ • 500-999 reviews',
    minRating: 4.5,
    minReviews: 0,
    match: (rating, reviews) =>
      (rating >= 4.5 && reviews <= 499) ||
      (rating >= 4.5 && rating < 4.8 && reviews >= 500 && reviews <= 999),
  },
];

export const DEFAULT_SELECTED_CATEGORIES: CategoryId[] = ['topspots'];

/** Returns true if a restaurant matches ANY of the selected categories (union logic) */
export function matchesAnyCategory(
  rating: number,
  reviews: number,
  selectedCategories: CategoryId[]
): boolean {
  return CATEGORIES.some((cat) => {
    if (!selectedCategories.includes(cat.id)) return false;
    if (cat.match) return cat.match(rating, reviews);
    return (
      rating >= cat.minRating &&
      reviews >= cat.minReviews &&
      (cat.maxReviews === undefined || reviews <= cat.maxReviews)
    );
  });
}

/** Computes the least restrictive fetch params across all categories (for backend query) */
export function getWidestFetchParams(categories: CategoryConfig[]): { minRating: number; minReviews: number } {
  return {
    minRating: Math.min(...categories.map((c) => c.minRating)),
    minReviews: Math.min(...categories.map((c) => c.minReviews)),
  };
}