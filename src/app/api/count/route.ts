import { NextRequest, NextResponse } from 'next/server';
import { getCityByName } from '@/config/cities';
import { PLACE_TYPES } from '@/config/filters';

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
    console.log(`Getting restaurant count for ${city}...`);

    // Get city configuration from our predefined list
    const cityConfig = getCityByName(city);
    if (!cityConfig) {
      throw new Error(`City not supported: ${city}. Please select from available cities.`);
    }

    console.log(`Using predefined polygon for ${cityConfig.displayName}`);
    console.log(`Polygon coordinates:`, cityConfig.polygon);

    // Get restaurant count from Google Area Insights API using polygon
    // Close the polygon by adding first coordinate as last
    const coordinates = cityConfig.polygon.map(coord => ({
      latitude: coord.latitude,
      longitude: coord.longitude
    }));
    coordinates.push(coordinates[0]); // Close the polygon
    
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

    console.log(`Making count API call for ${cityConfig.displayName} using polygon filter`);

    const googleResponse = await fetch('https://areainsights.googleapis.com/v1:computeInsights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey
      },
      body: JSON.stringify(body)
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
      city: cityConfig.displayName,
      restaurantCount: count,
      estimatedCost: cost
    });

  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}