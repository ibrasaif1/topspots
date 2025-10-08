import { NextRequest, NextResponse } from 'next/server';
import { PLACE_TYPES } from '@/config/filters';

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { polygon } = body;

    if (!polygon || !Array.isArray(polygon) || polygon.length !== 5) {
      return NextResponse.json({
        error: 'Invalid polygon. Must provide 5 coordinates (4 points + closing point)'
      }, { status: 400 });
    }

    console.log(`Getting restaurant count for custom polygon...`);
    console.log(`Polygon coordinates:`, polygon);

    const requestBody = {
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: {
          customArea: {
            polygon: {
              coordinates: polygon
            }
          }
        },
        typeFilter: { includedTypes: PLACE_TYPES },
        ratingFilter: { minRating: 4.5, maxRating: 5.0 },
        operatingStatus: ['OPERATING_STATUS_OPERATIONAL']
      }
    };

    console.log(`Making count API call using custom polygon filter`);

    const googleResponse = await fetch('https://areainsights.googleapis.com/v1:computeInsights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      throw new Error(`Google API error: ${googleResponse.status} - ${errorText}`);
    }

    const googleData = await googleResponse.json();
    const count = parseInt(googleData.count || '0');
    const cost = count * 0.02;

    console.log(`Found ${count} restaurants, estimated cost: $${cost}`);

    return NextResponse.json({
      ok: true,
      restaurantCount: count,
      estimatedCost: cost
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}