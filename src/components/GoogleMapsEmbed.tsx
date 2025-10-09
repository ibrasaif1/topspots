'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Wrapper } from '@googlemaps/react-wrapper'

interface GoogleMapsEmbedProps {
  location?: string
  onPolygonChange?: (polygon: {lat: number, lng: number}[]) => void
  clearPolygon?: boolean
  onPolygonCleared?: () => void
  isLocked?: boolean
  centerOffset?: number
  restaurants?: Array<{
    place_id: string
    name: string
    rating: number
    reviews: number
    gps_coordinates: { latitude: number; longitude: number }
    cuisine?: string
    priceRange?: string
  }>
}

function GoogleMapComponent({
  location,
  onPolygonChange,
  clearPolygon,
  onPolygonCleared,
  isLocked,
  centerOffset,
  restaurants,
}: {
  location?: string
  onPolygonChange?: (polygon: {lat: number, lng: number}[]) => void
  clearPolygon?: boolean
  onPolygonCleared?: () => void
  isLocked?: boolean
  centerOffset?: number
  restaurants?: Array<{
    place_id: string
    name: string
    rating: number
    reviews: number
    gps_coordinates: { latitude: number; longitude: number }
    cuisine?: string
    priceRange?: string
  }>
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantMarkersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonRef = useRef<any>(null)
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<{lat: number, lng: number}[]>([])

  // Geocode location when it changes
  useEffect(() => {
    if (!location) return

    const geocodeLocation = async () => {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
        )
        const data = await response.json()

        if (data.results && data.results.length > 0) {
          const { lat, lng } = data.results[0].geometry.location
          setCoordinates({ lat, lng })
        }
      } catch (error) {
        console.error('Geocoding error:', error)
      }
    }

    geocodeLocation()
  }, [location])

  // Create marker HTML element
  const createMarkerElement = useCallback((number: number) => {
    const div = document.createElement('div')
    div.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="${isLocked ? '#10b981' : '#EF4444'}" stroke="white" stroke-width="3"/>
        <text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${number}</text>
      </svg>
    `
    return div
  }, [isLocked])

  // Rebuild markers with correct numbering
  const rebuildMarkers = useCallback((points: {lat: number, lng: number}[]) => {
    if (!mapInstanceRef.current || !window.google?.maps) return

    // Clear old markers
    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []

    // Create new markers
    points.forEach((point, index) => {
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: point,
        map: mapInstanceRef.current,
        gmpDraggable: !isLocked,
        content: createMarkerElement(index + 1),
      })

      // Drag listener
      marker.addListener('dragend', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newPos = marker.position as any
        if (!newPos) return

        const newLat = typeof newPos.lat === 'function' ? (newPos.lat as () => number)() : (newPos.lat as number)
        const newLng = typeof newPos.lng === 'function' ? (newPos.lng as () => number)() : (newPos.lng as number)

        setPolygonPoints(prev => {
          const updated = [...prev]
          updated[index] = { lat: newLat, lng: newLng }

          // Update polygon
          if (polygonRef.current && updated.length >= 3) {
            polygonRef.current.setPath(updated)
          }

          // Notify parent
          if (updated.length === 4) {
            onPolygonChange?.(updated)
          }

          return updated
        })
      })

      // Click to remove (only if not locked)
      marker.addListener('click', () => {
        if (!isLocked) {
          setPolygonPoints(prev => {
            const updated = prev.filter((_, i) => i !== index)

            // Rebuild polygon
            if (polygonRef.current) {
              polygonRef.current.setMap(null)
              polygonRef.current = null
            }

            if (updated.length >= 3) {
              const polygon = new window.google.maps.Polygon({
                paths: updated,
                strokeColor: isLocked ? '#10b981' : '#3b82f6',
                strokeOpacity: 0.8,
                strokeWeight: 3,
                fillColor: isLocked ? '#10b981' : '#3b82f6',
                fillOpacity: isLocked ? 0.15 : 0.2,
                map: mapInstanceRef.current
              })
              polygonRef.current = polygon
            }

            // Rebuild markers with new numbering
            rebuildMarkers(updated)

            // Notify parent
            if (updated.length === 4) {
              onPolygonChange?.(updated)
            }

            return updated
          })
        }
      })

      markersRef.current.push(marker)
    })
  }, [isLocked, onPolygonChange, createMarkerElement])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || mapInstanceRef.current) return

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 35, lng: 240 },
      zoom: 4,
      minZoom: 3,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      zoomControl: true,
      gestureHandling: 'cooperative',
      mapId: "2ddce5326308b2176661a3da",
    })
  
    mapInstanceRef.current = map
  
    // Handle map clicks to add polygon points
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addListener('click', (e: any) => {
      if (isLocked || !e.latLng) return
  
      const clickedLat = e.latLng.lat()
      const clickedLng = e.latLng.lng()
      const newPoint = { lat: clickedLat, lng: clickedLng }
  
      setPolygonPoints(prev => {
        if (prev.length >= 4) return prev
  
        const updated = [...prev, newPoint]
  
        if (updated.length >= 3) {
          if (polygonRef.current) {
            polygonRef.current.setPath(updated)
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
  
        rebuildMarkers(updated)
  
        if (updated.length === 4) {
          onPolygonChange?.(updated)
        }
  
        return updated
      })
    })
  
    return () => {
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }
    }
  }, [isLocked, onPolygonChange, rebuildMarkers]) // Empty dependency array - only run once
  
  // Separate effect to update center when coordinates change
  useEffect(() => {
    if (!mapInstanceRef.current || !coordinates) return
  
    let center = coordinates;
    if (centerOffset) {
      const offsetLng = coordinates.lng + (centerOffset * 0.01);
      center = { lat: coordinates.lat, lng: offsetLng };
    }
  
    mapInstanceRef.current.setCenter(center)
    mapInstanceRef.current.setZoom(12)
  }, [coordinates, centerOffset])
  

  // Update polygon color when locked
  useEffect(() => {
    if (polygonRef.current && isLocked && window.google?.maps?.Polygon) {
      polygonRef.current.setMap(null)
      const lockedPolygon = new window.google.maps.Polygon({
        paths: polygonPoints,
        strokeColor: '#10b981',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        fillColor: '#10b981',
        fillOpacity: 0.15,
        map: mapInstanceRef.current
      })
      polygonRef.current = lockedPolygon
      
      // Rebuild markers with green color
      rebuildMarkers(polygonPoints)
    }
  }, [isLocked, polygonPoints, rebuildMarkers])

  // Handle clear polygon
  useEffect(() => {
    if (clearPolygon) {
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []

      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }

      setPolygonPoints([])
      onPolygonCleared?.()
    }
  }, [clearPolygon, onPolygonCleared])

  // Add restaurant markers
  useEffect(() => {
    if (!mapInstanceRef.current || !restaurants || restaurants.length === 0 || !window.google?.maps) return

    // Clear old restaurant markers
    restaurantMarkersRef.current.forEach(marker => marker.setMap(null))
    restaurantMarkersRef.current = []

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (char) => {
        switch (char) {
          case "&": return "&amp;";
          case "<": return "&lt;";
          case ">": return "&gt;";
          case '"': return "&quot;";
          case "'": return "&#39;";
          default: return char;
        }
      });

    restaurants.forEach((restaurant) => {
      if (!restaurant.gps_coordinates?.latitude || !restaurant.gps_coordinates?.longitude) return

      const position = {
        lat: restaurant.gps_coordinates.latitude,
        lng: restaurant.gps_coordinates.longitude
      }

      let marker;

      try {
        // Use AdvancedMarkerElement if available
        if (window.google.maps.marker?.PinElement && window.google.maps.marker?.AdvancedMarkerElement) {
          const pin = new window.google.maps.marker.PinElement({
            background: "#EF4444",
            borderColor: "#DC2626",
            glyphColor: "#FFFFFF",
            scale: 1,
          })

          marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: position,
            map: mapInstanceRef.current,
            title: restaurant.name,
            content: pin.element,
          })
        } else {
          // Fallback to legacy Marker
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const LegacyMarker = (window.google.maps as any).Marker
          marker = new LegacyMarker({
            position: position,
            map: mapInstanceRef.current,
            title: restaurant.name,
            icon: {
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#EF4444"/>
                </svg>
              `),
              scaledSize: new window.google.maps.Size(24, 24),
              anchor: new window.google.maps.Point(12, 24)
            }
          })
        }
      } catch (error) {
        console.warn('Failed to create restaurant marker:', error)
        return
      }

      // Add click listener to show info window
      marker.addListener('click', () => {
        // Close existing InfoWindow
        if (infoWindowRef.current) {
          infoWindowRef.current.close()
        }

        // Create InfoWindow if it doesn't exist
        if (!infoWindowRef.current) {
          infoWindowRef.current = new window.google.maps.InfoWindow({
            zIndex: 2000
          })
        }

        const detailParts: string[] = []
        if (restaurant.cuisine) detailParts.push(escapeHtml(restaurant.cuisine))
        if (restaurant.priceRange) detailParts.push(escapeHtml(restaurant.priceRange))

        const cleanPlaceId = restaurant.place_id.replace('places/', '')
        const googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${cleanPlaceId}`

        const content = `
          <div style="
            padding: 0;
            margin: 0;
            max-width: 260px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.3;
            cursor: pointer;
          " onclick="window.open('${googleMapsUrl}', '_blank')">
            <div style="font-weight: 600; font-size: 15px; color: #111827; margin: 0 0 6px 0;">
              ${escapeHtml(restaurant.name)}
            </div>

            ${restaurant.rating ? `<div style="color: #059669; margin: 0 0 4px 0; font-size: 13px; font-weight: 500;">⭐ ${restaurant.rating.toFixed(1)} · ${restaurant.reviews?.toLocaleString() ?? 0} reviews</div>` : ""}

            ${detailParts.length ? `<div style="color: #6b7280; font-size: 12px; margin: 0;">${detailParts.join(" · ")}</div>` : ""}
          </div>
        `

        infoWindowRef.current.setContent(content)
        infoWindowRef.current.open(mapInstanceRef.current, marker)
      })

      restaurantMarkersRef.current.push(marker)
    })

    return () => {
      restaurantMarkersRef.current.forEach(marker => marker.setMap(null))
      restaurantMarkersRef.current = []
      if (infoWindowRef.current) {
        infoWindowRef.current.close()
      }
    }
  }, [restaurants])

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
  onPolygonChange,
  clearPolygon,
  onPolygonCleared,
  isLocked,
  centerOffset,
  restaurants,
}: GoogleMapsEmbedProps) {
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
        onPolygonChange={onPolygonChange}
        clearPolygon={clearPolygon}
        onPolygonCleared={onPolygonCleared}
        isLocked={isLocked}
        centerOffset={centerOffset}
        restaurants={restaurants}
      />
    </Wrapper>
  )
}