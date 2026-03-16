import { subdivideQuad, closePolygon, toGoogleFormat, Point } from '@/lib/subdivision';
import { NextRequest, NextResponse } from 'next/server';
import { PLACE_TYPES } from '@/config/filters';

const THRESHOLD = 100;

async function getCount(polygon: Point[], apiKey: string): Promise<number> {
  const closedPolygon = closePolygon(polygon);

  const requestBody = {
    insights: ['INSIGHT_COUNT'],
    filter: {
      locationFilter: {
        customArea: {
          polygon: {
            coordinates: toGoogleFormat(closedPolygon)
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
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return parseInt(data.count || '0');
}

async function getPlaceIds(polygon: Point[], apiKey: string): Promise<string[]> {
  const closedPolygon = closePolygon(polygon);

  const requestBody = {
    insights: ['INSIGHT_PLACES'],
    filter: {
      locationFilter: {
        customArea: {
          polygon: {
            coordinates: toGoogleFormat(closedPolygon)
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
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  // Extract place IDs from the response
  const placeInfos = data.placeInfos || [];
  return placeInfos.map((info: { place: string }) => info.place);
}

async function collectPlacesRecursive(
  polygon: Point[],
  count: number,
  apiKey: string
): Promise<string[]> {
  console.log(`Processing polygon with count: ${count}`);

  if (count <= THRESHOLD) {
    // Small enough - get place IDs directly
    console.log(`Count <= ${THRESHOLD}, fetching place IDs...`);
    return getPlaceIds(polygon, apiKey);
  }

  // Too many - subdivide into 4 quadrants
  console.log(`Count > ${THRESHOLD}, subdividing...`);
  const quadrants = subdivideQuad(polygon);
  const allPlaceIds: string[] = [];

  for (const quad of quadrants) {
    const quadCount = await getCount(quad, apiKey);
    const placeIds = await collectPlacesRecursive(quad, quadCount, apiKey);
    allPlaceIds.push(...placeIds);
  }

  // Dedupe in case of overlap
  return [...new Set(allPlaceIds)];
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { polygon, count } = body;

    // Accept either 4 points or 5 points (closed polygon)
    if (!polygon || !Array.isArray(polygon)) {
      return NextResponse.json({ error: 'Invalid polygon' }, { status: 400 });
    }

    // Normalize to 4 points (remove closing point if present)
    let points: Point[] = polygon;
    if (polygon.length === 5) {
      points = polygon.slice(0, 4);
    } else if (polygon.length !== 4) {
      return NextResponse.json({
        error: 'Invalid polygon. Must provide 4 or 5 coordinates'
      }, { status: 400 });
    }

    // Normalize point format (handle both {lat, lng} and {latitude, longitude})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    points = points.map((p: any) => ({
      lat: p.lat ?? p.latitude,
      lng: p.lng ?? p.longitude
    }));

    console.log(`Starting collection for polygon with initial count: ${count}`);

    const placeIds = await collectPlacesRecursive(points, count, apiKey);

    console.log(`Collected ${placeIds.length} unique place IDs`);

    return NextResponse.json({
      ok: true,
      placeIds,
      count: placeIds.length
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
