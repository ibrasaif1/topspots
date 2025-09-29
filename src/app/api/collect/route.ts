import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { getCityByName } from '@/config/cities';
import { PLACE_TYPES } from '@/config/filters';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface PlaceDetails {
  id: string;
  name: string;
  placeId: string; // The "places/XXXX" resource identifier
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: Record<string, unknown>;
  location?: {
    latitude: number;
    longitude: number;
  };
}

const COUNT_LIMIT = 100; // INSIGHT_PLACES cap
const MAX_WORKERS = 8; // Reduced concurrent requests to avoid rate limits
const BATCH_DELAY = 500; // 500ms delay between batches

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get('city');

  if (!city) {
    return NextResponse.json({ error: 'Missing city parameter' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  try {
    console.log(`Collecting place IDs for ${city}...`);
    
    const placeIds = await collectPlaceIds(city, apiKey);
    console.log(`Found ${placeIds.length} place IDs`);
    
    // Save place IDs first, before hydration
    const filename = city.toLowerCase().replace(/\s+/g, '_');
    const filePath = join(process.cwd(), 'public', `${filename}_restaurants.json`);
    const placeIdsPath = join(process.cwd(), 'public', `${filename}_place_ids.json`);
    
    // Save place IDs separately for hydration endpoint
    const placeIdsData = {
      city,
      generatedAt: new Date().toISOString(),
      totalPlaceIds: placeIds.length,
      placeIds: placeIds
    };
    await writeFile(placeIdsPath, JSON.stringify(placeIdsData, null, 2));
    console.log(`Saved ${placeIds.length} place IDs to ${placeIdsPath}`);

    console.log(`Hydrating place details...`);
    const hydrationResult = await hydratePlaces(placeIds, apiKey);
    console.log(`Hydrated ${hydrationResult.places.length} places`);
    
    // Save restaurant data regardless of whether rate limit was hit
    const fileData = {
      city,
      generatedAt: new Date().toISOString(),
      totalPlaces: hydrationResult.places.length,
      totalPlaceIds: placeIds.length,
      processedCount: hydrationResult.processedCount,
      rateLimitHit: hydrationResult.rateLimitHit,
      filters: { 
        minRating: 4.5,
        includedTypes: PLACE_TYPES 
      },
      places: hydrationResult.places
    };

    await writeFile(filePath, JSON.stringify(fileData, null, 2));
    console.log(`Saved ${hydrationResult.places.length} places to ${filePath}`);

    if (hydrationResult.rateLimitHit) {
      return NextResponse.json({
        error: 'Rate limit hit during hydration. Place IDs saved, partial results saved.',
        rateLimitHit: true,
        city,
        totalPlaceIds: placeIds.length,
        processedCount: hydrationResult.processedCount,
        hydratedPlaces: hydrationResult.places.length,
        savedTo: `${filename}_restaurants.json`,
        placeIdsSavedTo: `${filename}_place_ids.json`,
        nextSteps: `Use /api/hydrate?city=${encodeURIComponent(city)}&start=${hydrationResult.processedCount} to continue`
      }, { status: 429 });
    }

    return NextResponse.json({
      ok: true,
      city,
      totalPlaces: hydrationResult.places.length,
      totalPlaceIds: placeIds.length,
      savedTo: `${filename}_restaurants.json`,
      places: hydrationResult.places
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

async function collectPlaceIds(city: string, apiKey: string): Promise<string[]> {
  const cityConfig = getCityByName(city);
  if (!cityConfig) {
    throw new Error(`City not supported: ${city}`);
  }

  const ids = new Set<string>();
  const stack: Coordinate[][] = [cityConfig.polygon];
  let iteration = 0;

  console.log(`Starting with ${stack.length} polygons in stack`);

  while (stack.length > 0) {
    iteration++;
    const polygon = stack.pop()!;
    
    console.log(`Iteration ${iteration}: Processing polygon, ${stack.length} remaining in stack`);
    
    try {
      console.log(`Getting count for polygon...`);
      const count = await getPolygonCountFromAPI(polygon);
      console.log(`Polygon has ${count} restaurants`);
      
      if (count === 0) {
        console.log(`Skipping empty polygon`);
        continue;
      }
      
      if (count <= COUNT_LIMIT) {
        console.log(`Count ≤ ${COUNT_LIMIT}, getting place IDs...`);
        try {
          const placeIds = await getPolygonPlaces(polygon, apiKey);
          placeIds.forEach(id => ids.add(id));
          console.log(`Added ${placeIds.length} place IDs, total unique: ${ids.size}`);
        } catch (error) {
          console.log(`INSIGHT_PLACES failed, splitting polygon. Error:`, error);
          const subPolygons = splitPolygon(polygon);
          stack.push(...subPolygons);
          console.log(`Split into ${subPolygons.length} sub-polygons, stack now: ${stack.length}`);
        }
      } else {
        console.log(`Count ${count} > ${COUNT_LIMIT}, splitting polygon`);
        const subPolygons = splitPolygon(polygon);
        stack.push(...subPolygons);
        console.log(`Split into ${subPolygons.length} sub-polygons, stack now: ${stack.length}`);
      }
    } catch (error) {
      console.log(`Error processing polygon:`, error);
      if (stack.length < 2048) {
        const subPolygons = splitPolygon(polygon);
        stack.push(...subPolygons);
        console.log(`Error handling: split into ${subPolygons.length} sub-polygons, stack now: ${stack.length}`);
      } else {
        console.log(`Stack too large (${stack.length}), skipping this polygon`);
      }
    }
  }

  console.log(`Finished collecting place IDs. Total iterations: ${iteration}, Unique IDs: ${ids.size}`);

  return Array.from(ids).sort();
}

async function getPolygonCountFromAPI(polygon: Coordinate[]): Promise<number> {
  // Create a temporary city object to pass to the count API
  
  // We'll need to temporarily store this polygon somewhere the count API can access it
  // For now, let's use the direct approach with a custom area
  const coordinates = [...polygon, polygon[0]];
  
  const body = {
    insights: ['INSIGHT_COUNT'],
    filter: {
      locationFilter: {
        customArea: {
          polygon: {
            coordinates: coordinates
          }
        }
      },
      typeFilter: { includedTypes: PLACE_TYPES },
      ratingFilter: { minRating: 4.5, maxRating: 5.0 },
      operatingStatus: ['OPERATING_STATUS_OPERATIONAL']
    }
  };

  const response = await fetch('https://areainsights.googleapis.com/v1:computeInsights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY!
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Count API error: ${response.status}`);
  }

  const data = await response.json();
  return parseInt(data.count || '0');
}

async function getPolygonPlaces(polygon: Coordinate[], apiKey: string): Promise<string[]> {
  // Close the polygon
  const coordinates = [...polygon, polygon[0]];
  
  const body = {
    insights: ['INSIGHT_PLACES'],
    filter: {
      locationFilter: {
        customArea: {
          polygon: {
            coordinates: coordinates
          }
        }
      },
      typeFilter: { includedTypes: PLACE_TYPES },
      ratingFilter: { minRating: 4.5, maxRating: 5.0 },
      operatingStatus: ['OPERATING_STATUS_OPERATIONAL']
    }
  };

  const response = await fetch('https://areainsights.googleapis.com/v1:computeInsights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Places API error: ${response.status}`);
  }

  const data = await response.json();
  
  const placeIds: string[] = [];
  
  for (const insight of data.placeInsights || []) {
    if (insight.place) {
      placeIds.push(insight.place); // "places/XXXX"
    }
  }

  console.log(`Extracted ${placeIds.length} place IDs from response`);
  return placeIds;
}

function splitPolygon(polygon: Coordinate[]): Coordinate[][] {
  // Find bounds of polygon
  const minLat = Math.min(...polygon.map(p => p.latitude));
  const maxLat = Math.max(...polygon.map(p => p.latitude));
  const minLng = Math.min(...polygon.map(p => p.longitude));
  const maxLng = Math.max(...polygon.map(p => p.longitude));

  // Split in half both ways
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  // Create 4 sub-polygons in counter-clockwise order (NW, NE, SW, SE)
  const nw: Coordinate[] = [
    { latitude: midLat, longitude: minLng },    // Bottom-left
    { latitude: midLat, longitude: midLng },    // Bottom-right
    { latitude: maxLat, longitude: midLng },    // Top-right
    { latitude: maxLat, longitude: minLng }     // Top-left
  ];

  const ne: Coordinate[] = [
    { latitude: midLat, longitude: midLng },    // Bottom-left
    { latitude: midLat, longitude: maxLng },    // Bottom-right
    { latitude: maxLat, longitude: maxLng },    // Top-right
    { latitude: maxLat, longitude: midLng }     // Top-left
  ];

  const sw: Coordinate[] = [
    { latitude: minLat, longitude: minLng },    // Bottom-left
    { latitude: minLat, longitude: midLng },    // Bottom-right
    { latitude: midLat, longitude: midLng },    // Top-right
    { latitude: midLat, longitude: minLng }     // Top-left
  ];

  const se: Coordinate[] = [
    { latitude: minLat, longitude: midLng },    // Bottom-left
    { latitude: minLat, longitude: maxLng },    // Bottom-right
    { latitude: midLat, longitude: maxLng },    // Top-right
    { latitude: midLat, longitude: midLng }     // Top-left
  ];

  return [nw, ne, sw, se];
}

async function hydratePlace(placeResourceName: string, apiKey: string): Promise<PlaceDetails | null> {
  const url = `https://places.googleapis.com/v1/${placeResourceName}`;
  const fieldMask = "id,name,displayName,googleMapsUri,primaryType,primaryTypeDisplayName,types,rating,userRatingCount,priceLevel,priceRange,location";
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Place details error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      id: data.id,
      name: data.displayName?.text || data.displayName || data.name,
      placeId: data.name,
      googleMapsUri: data.googleMapsUri,
      primaryType: data.primaryType,
      primaryTypeDisplayName: data.primaryTypeDisplayName?.text || data.primaryTypeDisplayName,
      types: data.types || [],
      rating: data.rating,
      userRatingCount: data.userRatingCount,
      priceLevel: data.priceLevel,
      priceRange: data.priceRange,
      location: data.location
    };

  } catch (error) {
    console.error(`Error hydrating place ${placeResourceName}:`, error);
    return null;
  }
}

async function hydratePlaces(placeNames: string[], apiKey: string): Promise<{
  places: PlaceDetails[];
  rateLimitHit: boolean;
  processedCount: number;
}> {
  const results: PlaceDetails[] = [];
  const concurrency = MAX_WORKERS;
  let rateLimitHit = false;
  let processedCount = 0;
  
  // Process in batches to respect rate limits
  for (let i = 0; i < placeNames.length; i += concurrency) {
    if (rateLimitHit) {
      console.log(`Rate limit hit, stopping hydration. Processed ${results.length} places so far.`);
      break;
    }
    
    const batch = placeNames.slice(i, i + concurrency);
    console.log(`Processing batch ${Math.floor(i/concurrency) + 1}/${Math.ceil(placeNames.length/concurrency)} (${batch.length} places)`);
    
    const promises = batch.map(placeName => hydratePlace(placeName, apiKey));
    const batchResults = await Promise.allSettled(promises);
    
    // Check for rate limit errors
    for (const result of batchResults) {
      processedCount++;
      
      if (result.status === 'rejected' && result.reason?.message?.includes('429')) {
        console.log(`Rate limit detected (429 error), stopping hydration process`);
        rateLimitHit = true;
        break;
      }
      
      if (result.status === 'fulfilled' && result.value !== null) {
        results.push(result.value);
      }
    }
    
    if (rateLimitHit) break;
    
    // Add delay between batches if not the last batch
    if (i + concurrency < placeNames.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  return {
    places: results,
    rateLimitHit,
    processedCount
  };
}