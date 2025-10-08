'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Wrapper } from '@googlemaps/react-wrapper'

// Google Maps TypeScript interfaces
interface GoogleMapsMap {
  setCenter: (center: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
  addListener: (event: string, callback: (...args: unknown[]) => void) => void
  getCenter?: () => { lat: () => number; lng: () => number }
  getZoom?: () => number
  fitBounds?: (bounds: unknown, padding?: unknown) => void
}

interface GoogleMapsMarker {
  setMap: (map: GoogleMapsMap | null) => void
  setPosition: (position: { lat: number; lng: number }) => void
}

interface GoogleMapsPolygon {
  setMap: (map: GoogleMapsMap | null) => void
  setPath?: (path: { lat: number; lng: number }[]) => void
}

interface GoogleMapsEmbedProps {
  location?: string
  onCoordinatesChange?: (coords: {lat: number, lng: number}) => void
  onPolygonChange?: (polygon: {lat: number, lng: number}[]) => void
  clearPolygon?: boolean
  onPolygonCleared?: () => void
  isLocked?: boolean
  showExistingPins?: boolean
}

function GoogleMapComponent({
  location,
  onCoordinatesChange,
  onPolygonChange,
  clearPolygon,
  onPolygonCleared,
  isLocked,
  showExistingPins,
  currentZoom,
}: {
  location?: string
  onCoordinatesChange?: (coords: {lat: number, lng: number}) => void
  onPolygonChange?: (polygon: {lat: number, lng: number}[]) => void
  clearPolygon?: boolean
  onPolygonCleared?: () => void
  isLocked?: boolean
  showExistingPins?: boolean
  currentZoom: number
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<GoogleMapsMap | null>(null)
  const markerRef = useRef<GoogleMapsMarker[]>([])
  const polygonRef = useRef<GoogleMapsPolygon | null>(null)
  const existingPinsRef = useRef<GoogleMapsMarker[]>([])
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<{lat: number, lng: number}[]>([])
  const [loading, setLoading] = useState(false)

  // Geocode location when it changes
  useEffect(() => {
    if (!location) return

    const geocodeLocation = async () => {
      setLoading(true)
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
        )
        const data = await response.json()

        if (data.results && data.results.length > 0) {
          const { lat, lng } = data.results[0].geometry.location
          const coords = { lat, lng }
          setCoordinates(coords)
          onCoordinatesChange?.(coords)
        }
      } catch (error) {
        console.error('Geocoding error:', error)
      } finally {
        setLoading(false)
      }
    }

    geocodeLocation()
  }, [location, onCoordinatesChange])

  // Load existing restaurant pins
  useEffect(() => {
    if (!showExistingPins || !mapInstanceRef.current || !window.google?.maps) return

    const loadExistingPins = async () => {
      try {
        // Load all restaurant data files
        const cities = ['austin', 'san_diego']
        const allRestaurants: Array<{
          place_id?: string;
          name?: string;
          gps_coordinates?: { latitude: number; longitude: number };
        }> = []

        for (const city of cities) {
          try {
            const res = await fetch(`/${city}_restaurants.json`, { cache: 'no-store' })
            if (res.ok) {
              const data = await res.json()
              if (Array.isArray(data)) {
                allRestaurants.push(...data)
              } else if (data.places && Array.isArray(data.places)) {
                allRestaurants.push(...data.places.map((place: { placeId?: string; id?: string; name?: string; location?: { latitude: number; longitude: number } }) => ({
                  place_id: place.placeId || place.id,
                  name: place.name,
                  gps_coordinates: place.location || { latitude: 0, longitude: 0 }
                })))
              }
            }
          } catch (err) {
            console.error(`Failed to load ${city} restaurants:`, err)
          }
        }

        // Clear existing pins
        existingPinsRef.current.forEach(marker => marker.setMap(null))
        existingPinsRef.current = []

        // Create small gray markers for existing restaurants
        allRestaurants.forEach((restaurant) => {
          if (!restaurant.gps_coordinates?.latitude || !restaurant.gps_coordinates?.longitude) return

          const marker = new (window.google.maps as unknown as { Marker: new (options: Record<string, unknown>) => GoogleMapsMarker }).Marker({
            position: {
              lat: restaurant.gps_coordinates.latitude,
              lng: restaurant.gps_coordinates.longitude
            },
            map: mapInstanceRef.current!,
            icon: {
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="4" cy="4" r="3" fill="#6B7280" opacity="0.6"/>
                </svg>
              `),
              scaledSize: new window.google.maps.Size(8, 8),
              anchor: new window.google.maps.Point(4, 4)
            }
          })

          existingPinsRef.current.push(marker)
        })
      } catch (error) {
        console.error('Error loading existing pins:', error)
      }
    }

    loadExistingPins()

    return () => {
      existingPinsRef.current.forEach(marker => marker.setMap(null))
      existingPinsRef.current = []
    }
  }, [showExistingPins, coordinates])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || !coordinates) return

    const map = new window.google.maps.Map(mapRef.current, {
      center: coordinates,
      zoom: currentZoom,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      zoomControl: true,
      gestureHandling: 'cooperative'
    })

    mapInstanceRef.current = map

    // Handle map clicks to add polygon points
    map.addListener('click', (...args: unknown[]) => {
      // Don't allow clicks if locked
      if (isLocked) {
        return
      }

      const e = args[0] as { latLng?: { lat: () => number; lng: () => number } }
      const clickedLat = e.latLng?.lat() ?? 0
      const clickedLng = e.latLng?.lng() ?? 0
      const newPoint = { lat: clickedLat, lng: clickedLng }

      setPolygonPoints(prev => {
        // Only allow 4 points max
        if (prev.length >= 4) {
          return prev
        }

        const updated = [...prev, newPoint]

        // Create marker for this point
        const marker = new (window.google.maps as unknown as { Marker: new (options: Record<string, unknown>) => GoogleMapsMarker }).Marker({
          position: newPoint,
          map: map,
          label: {
            text: (updated.length).toString(),
            color: 'white',
            fontWeight: 'bold'
          },
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="12" fill="#EF4444" stroke="white" stroke-width="3"/>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(32, 32),
            anchor: new window.google.maps.Point(16, 16)
          }
        })
        markerRef.current.push(marker)

        // Update or create polygon
        if (updated.length >= 3) {
          if (polygonRef.current) {
            polygonRef.current.setPath?.(updated)
          } else {
            const polygon = new window.google.maps.Polygon({
              paths: updated,
              strokeColor: '#3b82f6',
              strokeOpacity: 0.8,
              strokeWeight: 3,
              fillColor: '#3b82f6',
              fillOpacity: 0.2,
              map: map
            })
            polygonRef.current = polygon
          }
        }

        // Notify parent of polygon change
        if (updated.length === 4) {
          onPolygonChange?.(updated)
        }

        return updated
      })
    })

    return () => {
      markerRef.current.forEach(marker => marker.setMap(null))
      markerRef.current = []
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }
    }
  }, [coordinates, currentZoom, onPolygonChange, isLocked])

  // Update polygon color when locked
  useEffect(() => {
    if (polygonRef.current && isLocked) {
      polygonRef.current.setMap(null)
      if (window.google?.maps?.Polygon) {
        const lockedPolygon = new window.google.maps.Polygon({
          paths: polygonPoints,
          strokeColor: '#10b981',
          strokeOpacity: 0.8,
          strokeWeight: 3,
          fillColor: '#10b981',
          fillOpacity: 0.15,
          map: mapInstanceRef.current!
        })
        polygonRef.current = lockedPolygon
      }
    }
  }, [isLocked, polygonPoints])

  // Handle clear polygon
  useEffect(() => {
    if (clearPolygon) {
      // Clear markers
      markerRef.current.forEach(marker => marker.setMap(null))
      markerRef.current = []

      // Clear polygon
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }

      // Reset state
      setPolygonPoints([])

      // Notify parent that clearing is complete
      onPolygonCleared?.()
    }
  }, [clearPolygon, onPolygonCleared])

  if (loading) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden shadow-lg relative bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading map...</div>
      </div>
    )
  }

  if (!coordinates) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden shadow-lg relative bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Enter a location to view map</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full rounded-lg overflow-hidden shadow-lg relative">
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} className="rounded-lg" />
      {isLocked && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">Area Locked</span>
        </div>
      )}
    </div>
  )
}

export default function GoogleMapsEmbed({
  location = "New York, NY",
  onCoordinatesChange,
  onPolygonChange,
  clearPolygon,
  onPolygonCleared,
  isLocked,
  showExistingPins
}: GoogleMapsEmbedProps) {
  const [currentZoom] = useState(12)

  return (
    <Wrapper
      apiKey={process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_FRONTEND_API_KEY || ''
        : process.env.NEXT_PUBLIC_DEV_KEY || process.env.NEXT_PUBLIC_FRONTEND_API_KEY || ''}
      libraries={["marker"]}
      render={() => <div />}
    >
      <GoogleMapComponent
        location={location}
        onCoordinatesChange={onCoordinatesChange}
        onPolygonChange={onPolygonChange}
        clearPolygon={clearPolygon}
        onPolygonCleared={onPolygonCleared}
        isLocked={isLocked}
        showExistingPins={showExistingPins}
        currentZoom={currentZoom}
      />
    </Wrapper>
  )
}
