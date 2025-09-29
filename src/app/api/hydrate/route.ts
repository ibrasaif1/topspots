import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

interface PlaceDetails {
  id: string;
  name: string;
  placeId: string;
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

const MAX_WORKERS = 50; // Much more aggressive - Google's default quota is usually 100-1000 QPS
const BATCH_DELAY = 100; // 100ms delay between batches

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get('city');
  const start = parseInt(searchParams.get('start') || '0');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam) : null; // null means no limit

  if (!city) {
    return NextResponse.json({ error: 'Missing city parameter' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  try {
    // Read existing data file to get place IDs
    const filename = city.toLowerCase().replace(/\s+/g, '_');
    const filePath = join(process.cwd(), 'public', `${filename}_restaurants.json`);
    
    let existingData;
    try {
      const fileContent = await readFile(filePath, 'utf8');
      existingData = JSON.parse(fileContent);
    } catch {
      return NextResponse.json({ error: 'No place IDs found. Run /api/collect first.' }, { status: 404 });
    }

    // Get place IDs from a separate file if they were saved
    const placeIdsPath = join(process.cwd(), 'public', `${filename}_place_ids.json`);
    let placeIds: string[] = [];
    
    try {
      const placeIdsContent = await readFile(placeIdsPath, 'utf8');
      const placeIdsData = JSON.parse(placeIdsContent);
      placeIds = placeIdsData.placeIds || [];
    } catch {
      return NextResponse.json({ error: 'No place IDs found. Run /api/collect first.' }, { status: 404 });
    }

    console.log(`Found ${placeIds.length} total place IDs`);
    
    // Get existing place IDs to skip duplicates
    const existingPlaceIds = new Set((existingData.places || []).map((p: { placeId: string }) => p.placeId));
    console.log(`Found ${existingPlaceIds.size} existing places to skip`);
    
    // Filter out already processed place IDs
    const unprocessedPlaceIds = placeIds.filter(placeId => !existingPlaceIds.has(placeId));
    console.log(`${unprocessedPlaceIds.length} place IDs remaining to process`);
    
    console.log(`Starting hydration from index ${start}${limit ? `, limit ${limit}` : ', no limit'}`);

    // Get the subset to process
    const endIndex = limit ? Math.min(start + limit, unprocessedPlaceIds.length) : unprocessedPlaceIds.length;
    const batchPlaceIds = unprocessedPlaceIds.slice(start, endIndex);
    
    console.log(`Processing ${batchPlaceIds.length} place IDs (${start} to ${endIndex-1}) - skipping ${existingPlaceIds.size} already processed`);

    // Hydrate the batch with progress saving
    const saveProgress = async (places: PlaceDetails[], processedCount: number) => {
      const existingPlaces = existingData.places || [];
      const allPlaces = [...existingPlaces, ...places];
      const uniquePlaces = allPlaces.filter((place, index, arr) => 
        arr.findIndex(p => p.placeId === place.placeId) === index
      );

      const progressData = {
        ...existingData,
        totalPlaces: uniquePlaces.length,
        places: uniquePlaces,
        lastHydrated: new Date().toISOString(),
        lastBatchEnd: start + processedCount,
        inProgress: true
      };

      await writeFile(filePath, JSON.stringify(progressData, null, 2));
    };

    const hydrationResult = await hydratePlaces(batchPlaceIds, apiKey, saveProgress);
    
    // Check if rate limit was hit
    if (hydrationResult.rateLimitHit) {
      // Save what we got so far
      const existingPlaces = existingData.places || [];
      const allPlaces = [...existingPlaces, ...hydrationResult.places];
      const uniquePlaces = allPlaces.filter((place, index, arr) => 
        arr.findIndex(p => p.placeId === place.placeId) === index
      );

      const updatedData = {
        ...existingData,
        totalPlaces: uniquePlaces.length,
        places: uniquePlaces,
        lastHydrated: new Date().toISOString(),
        lastBatchEnd: hydrationResult.processedCount + start,
        rateLimitHit: true
      };

      await writeFile(filePath, JSON.stringify(updatedData, null, 2));

      return NextResponse.json({
        error: 'Rate limit hit (429 error). Please reduce concurrency or add delays.',
        rateLimitHit: true,
        processed: hydrationResult.processedCount,
        successful: hydrationResult.places.length,
        totalPlaces: uniquePlaces.length,
        savedSoFar: uniquePlaces.length,
        remainingPlaceIds: unprocessedPlaceIds.length - (hydrationResult.processedCount + start),
        nextStart: hydrationResult.processedCount + start
      }, { status: 429 });
    }
    
    // Merge with existing places
    const existingPlaces = existingData.places || [];
    const allPlaces = [...existingPlaces, ...hydrationResult.places];
    
    // Remove duplicates by placeId
    const uniquePlaces = allPlaces.filter((place, index, arr) => 
      arr.findIndex(p => p.placeId === place.placeId) === index
    );

    // Update the file
    const updatedData = {
      ...existingData,
      totalPlaces: uniquePlaces.length,
      places: uniquePlaces,
      lastHydrated: new Date().toISOString(),
      lastBatchEnd: endIndex
    };

    await writeFile(filePath, JSON.stringify(updatedData, null, 2));

    return NextResponse.json({
      ok: true,
      city,
      processed: batchPlaceIds.length,
      successful: hydrationResult.places.length,
      totalPlaces: uniquePlaces.length,
      totalPlaceIds: placeIds.length,
      skippedExisting: existingPlaceIds.size,
      remainingPlaceIds: unprocessedPlaceIds.length - endIndex,
      nextStart: endIndex < unprocessedPlaceIds.length ? endIndex : null,
      progress: `${endIndex}/${unprocessedPlaceIds.length} (${Math.round(endIndex/unprocessedPlaceIds.length*100)}%)`
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
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

async function hydratePlaces(placeNames: string[], apiKey: string, saveProgressCallback?: (places: PlaceDetails[], processedCount: number) => Promise<void>): Promise<{
  places: PlaceDetails[];
  rateLimitHit: boolean;
  processedCount: number;
}> {
  const results: PlaceDetails[] = [];
  const concurrency = MAX_WORKERS;
  let rateLimitHit = false;
  let processedCount = 0;
  
  for (let i = 0; i < placeNames.length; i += concurrency) {
    if (rateLimitHit) {
      console.log(`Rate limit hit, stopping hydration. Processed ${results.length} places so far.`);
      break;
    }
    
    const batchNum = Math.floor(i/concurrency) + 1;
    const totalBatches = Math.ceil(placeNames.length/concurrency);
    const batch = placeNames.slice(i, i + concurrency);
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} places) - ${results.length} successful so far`);
    
    const promises = batch.map(placeName => hydratePlace(placeName, apiKey));
    const batchResults = await Promise.allSettled(promises);
    
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
    
    // Save progress every batch
    if (saveProgressCallback) {
      console.log(`Saving progress: ${results.length} places hydrated so far...`);
      await saveProgressCallback(results, processedCount);
    }
    
    if (rateLimitHit) break;
    
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