'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Wrapper } from '@googlemaps/react-wrapper'
import { isCounterClockwise } from '@/lib/utils'

type Point = { lat: number; lng: number }
type Triangle = Point[]

// Helper function to calculate centroid of polygon points
function calculateCentroid(points: Point[]): Point {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  )
  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  }
}

// Create triangles from polygon vertices to centroid
function createTrianglesFromCentroid(polygon: Point[]): Triangle[] {
  const center = calculateCentroid(polygon)
  const triangles: Triangle[] = []

  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length
    triangles.push([polygon[i], polygon[next], center])
  }

  return triangles
}

// Recursively subdivide triangles
function subdivideTrianglesRecursively(triangles: Triangle[], depth: number): Triangle[] {
  if (depth <= 0) return triangles

  const subdivided: Triangle[] = []
  for (const tri of triangles) {
    const [a, b, c] = tri
    const ab = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    const bc = { lat: (b.lat + c.lat) / 2, lng: (b.lng + c.lng) / 2 }
    const ca = { lat: (c.lat + a.lat) / 2, lng: (c.lng + a.lng) / 2 }

    subdivided.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
  }

  return subdivideTrianglesRecursively(subdivided, depth - 1)
}

type Bounds = { north: number; south: number; east: number; west: number }

interface GoogleMapsEmbedProps {
  location?: string
  onPolygonChange?: (polygon: {lat: number, lng: number}[]) => void
  onPolygonValidation?: (isValid: boolean) => void
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
  showSubdivisions?: boolean
  subdivisionDepth?: number
  // Dev mode visualization props
  activeQuadrants?: Point[][]
  completedQuadrants?: Point[][]
  progressiveRestaurants?: Array<{
    place_id: string
    name: string
    rating: number
    reviews: number
    gps_coordinates: { latitude: number; longitude: number }
    cuisine?: string
    priceRange?: string
  }>
  // Viewport tracking props
  onZoomChange?: (zoom: number) => void
  onBoundsChange?: (bounds: Bounds) => void
  hoveredRestaurantId?: string | null
}

function GoogleMapComponent({
  location,
  onPolygonChange,
  onPolygonValidation,
  clearPolygon,
  onPolygonCleared,
  isLocked,
  centerOffset,
  restaurants,
  showSubdivisions,
  subdivisionDepth,
  activeQuadrants,
  completedQuadrants,
  progressiveRestaurants,
  onZoomChange,
  onBoundsChange,
  hoveredRestaurantId,
}: {
  location?: string
  onPolygonChange?: (polygon: {lat: number, lng: number}[]) => void
  onPolygonValidation?: (isValid: boolean) => void
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
  showSubdivisions?: boolean
  subdivisionDepth?: number
  activeQuadrants?: Point[][]
  completedQuadrants?: Point[][]
  progressiveRestaurants?: Array<{
    place_id: string
    name: string
    rating: number
    reviews: number
    gps_coordinates: { latitude: number; longitude: number }
    cuisine?: string
    priceRange?: string
  }>
  onZoomChange?: (zoom: number) => void
  onBoundsChange?: (bounds: Bounds) => void
  hoveredRestaurantId?: string | null
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantMarkersRef = useRef<Map<string, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null)
  const infoWindowCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isHoveringInfoWindowRef = useRef<boolean>(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subdivisionPolygonsRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const centroidMarkerRef = useRef<any>(null)
  // Dev mode visualization refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeQuadPolygonsRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completedQuadPolygonsRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progressiveMarkersRef = useRef<any[]>([])
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<{lat: number, lng: number}[]>([])

  // Geocode location when it changes (debounced)
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

    const timeoutId = setTimeout(geocodeLocation, 1000)
    return () => clearTimeout(timeoutId)
  }, [location])

  // Get polygon colors based on validity
  const getPolygonColors = useCallback((points: {lat: number, lng: number}[]) => {
    if (isLocked) {
      return { strokeColor: '#10b981', fillColor: '#10b981', fillOpacity: 0.15 };
    }

    if (points.length >= 3) {
      const isValid = isCounterClockwise(points);
      if (!isValid) {
        return { strokeColor: '#f97316', fillColor: '#f97316', fillOpacity: 0.2 }; // Orange for invalid
      }
    }

    return { strokeColor: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2 }; // Blue for valid/default
  }, [isLocked]);

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
            const colors = getPolygonColors(updated);
            polygonRef.current.setOptions({
              strokeColor: colors.strokeColor,
              fillColor: colors.fillColor,
              fillOpacity: colors.fillOpacity
            })
          }

          // Notify parent
          onPolygonChange?.(updated)

          // Notify parent about validation status
          if (updated.length >= 3) {
            onPolygonValidation?.(isCounterClockwise(updated))
          } else {
            onPolygonValidation?.(true)
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
              const colors = getPolygonColors(updated);
              const polygon = new window.google.maps.Polygon({
                paths: updated,
                strokeColor: colors.strokeColor,
                strokeOpacity: 0.8,
                strokeWeight: 3,
                fillColor: colors.fillColor,
                fillOpacity: colors.fillOpacity,
                map: mapInstanceRef.current
              })
              polygonRef.current = polygon
            }

            // Rebuild markers with new numbering
            rebuildMarkers(updated)

            // Notify parent
            onPolygonChange?.(updated)

            // Notify parent about validation status
            if (updated.length >= 3) {
              onPolygonValidation?.(isCounterClockwise(updated))
            } else {
              onPolygonValidation?.(true)
            }

            return updated
          })
        }
      })

      markersRef.current.push(marker)
    })
  }, [isLocked, onPolygonChange, onPolygonValidation, createMarkerElement, getPolygonColors])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || mapInstanceRef.current) return

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 35, lng: 240 },
      zoom: 4,
      minZoom: 3,
      disableDefaultUI: true,
      gestureHandling: 'cooperative',
      mapId: "2ddce5326308b2176661a3da",
    })
  
    mapInstanceRef.current = map

    // Debounce helper for bounds changes
    let boundsTimeout: NodeJS.Timeout | null = null
    const debouncedBoundsChange = () => {
      if (boundsTimeout) clearTimeout(boundsTimeout)
      boundsTimeout = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bounds = (map as any).getBounds()
        if (bounds && onBoundsChange) {
          const ne = bounds.getNorthEast()
          const sw = bounds.getSouthWest()
          onBoundsChange({
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng()
          })
        }
      }, 150) // Debounce by 150ms
    }

    // Zoom change listener
    map.addListener('zoom_changed', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zoom = (map as any).getZoom()
      if (zoom !== undefined && onZoomChange) {
        onZoomChange(zoom)
      }
      // Also update bounds when zoom changes
      debouncedBoundsChange()
    })

    // Bounds change listener (for panning)
    map.addListener('bounds_changed', debouncedBoundsChange)

    // Initial zoom and bounds notification after map is idle
    map.addListener('idle', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zoom = (map as any).getZoom()
      if (zoom !== undefined && onZoomChange) {
        onZoomChange(zoom)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bounds = (map as any).getBounds()
      if (bounds && onBoundsChange) {
        const ne = bounds.getNorthEast()
        const sw = bounds.getSouthWest()
        onBoundsChange({
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng()
        })
      }
    })
  
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
          const colors = getPolygonColors(updated);
          if (polygonRef.current) {
            polygonRef.current.setPath(updated)
            polygonRef.current.setOptions({
              strokeColor: colors.strokeColor,
              fillColor: colors.fillColor,
              fillOpacity: colors.fillOpacity
            })
          } else {
            const polygon = new window.google.maps.Polygon({
              paths: updated,
              strokeColor: colors.strokeColor,
              strokeOpacity: 0.8,
              strokeWeight: 3,
              fillColor: colors.fillColor,
              fillOpacity: colors.fillOpacity,
              map: map
            })
            polygonRef.current = polygon
          }
        }

        rebuildMarkers(updated)

        onPolygonChange?.(updated)

        // Notify parent about validation status
        if (updated.length >= 3) {
          onPolygonValidation?.(isCounterClockwise(updated))
        } else {
          onPolygonValidation?.(true) // Not enough points = valid by default
        }

        return updated
      })
    })
  
    return () => {
      if (boundsTimeout) clearTimeout(boundsTimeout)
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }
    }
  }, [isLocked, onPolygonChange, onPolygonValidation, rebuildMarkers, getPolygonColors, onZoomChange, onBoundsChange])
  
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
    restaurantMarkersRef.current.clear()

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

      // Build info window content
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

          ${restaurant.rating ? `<div style="color: #059669; margin: 0 0 4px 0; font-size: 13px; font-weight: 500;">⭐ ${restaurant.rating.toFixed(1)} · ${(Math.floor((restaurant.reviews ?? 0) / 100) * 100).toLocaleString()}+ reviews</div>` : ""}

          ${detailParts.length ? `<div style="color: #6b7280; font-size: 12px; margin: 0;">${detailParts.join(" · ")}</div>` : ""}
        </div>
      `

      const showInfoWindow = () => {
        // Clear any pending close timeout
        if (infoWindowCloseTimeoutRef.current) {
          clearTimeout(infoWindowCloseTimeoutRef.current)
          infoWindowCloseTimeoutRef.current = null
        }

        if (!infoWindowRef.current) {
          infoWindowRef.current = new window.google.maps.InfoWindow({ zIndex: 2000 })
        }
        infoWindowRef.current.setContent(content)
        infoWindowRef.current.open(mapInstanceRef.current, marker)

        // Add hover listeners to info window content after it opens
        setTimeout(() => {
          const infoWindowContent = document.querySelector('.gm-style-iw-c')
          if (infoWindowContent) {
            infoWindowContent.addEventListener('mouseenter', () => {
              isHoveringInfoWindowRef.current = true
              if (infoWindowCloseTimeoutRef.current) {
                clearTimeout(infoWindowCloseTimeoutRef.current)
                infoWindowCloseTimeoutRef.current = null
              }
            })
            infoWindowContent.addEventListener('mouseleave', () => {
              isHoveringInfoWindowRef.current = false
              scheduleCloseInfoWindow()
            })
          }
        }, 10)
      }

      const scheduleCloseInfoWindow = () => {
        // Only schedule close if not already scheduled
        if (infoWindowCloseTimeoutRef.current) return

        infoWindowCloseTimeoutRef.current = setTimeout(() => {
          if (!isHoveringInfoWindowRef.current && infoWindowRef.current) {
            infoWindowRef.current.close()
          }
          infoWindowCloseTimeoutRef.current = null
        }, 500) // Small delay to allow cursor to move to info window
      }

      const hideInfoWindow = () => {
        scheduleCloseInfoWindow()
      }

      // Add hover and click listeners
      const markerElement = marker.content || marker.element
      if (markerElement) {
        // AdvancedMarkerElement - use DOM events
        markerElement.addEventListener('mouseenter', showInfoWindow)
        markerElement.addEventListener('mouseleave', hideInfoWindow)
        markerElement.addEventListener('click', (e: Event) => {
          e.stopPropagation()
          window.open(googleMapsUrl, '_blank')
        })
        markerElement.style.cursor = 'pointer'
      } else {
        // Legacy Marker - use Maps API events
        marker.addListener('mouseover', showInfoWindow)
        marker.addListener('mouseout', hideInfoWindow)
        marker.addListener('click', () => {
          window.open(googleMapsUrl, '_blank')
        })
      }

      restaurantMarkersRef.current.set(restaurant.place_id, marker)
    })

    return () => {
      restaurantMarkersRef.current.forEach(marker => marker.setMap(null))
      restaurantMarkersRef.current.clear()
      if (infoWindowRef.current) {
        infoWindowRef.current.close()
      }
      if (infoWindowCloseTimeoutRef.current) {
        clearTimeout(infoWindowCloseTimeoutRef.current)
        infoWindowCloseTimeoutRef.current = null
      }
      isHoveringInfoWindowRef.current = false
    }
  }, [restaurants])

  // Handle marker highlighting when hoveredRestaurantId changes
  useEffect(() => {
    if (!window.google?.maps?.marker?.PinElement) return

    restaurantMarkersRef.current.forEach((marker, placeId) => {
      const isHovered = placeId === hoveredRestaurantId

      try {
        if (marker.content) {
          // AdvancedMarkerElement
          if (isHovered) {
            const highlightedPin = new window.google.maps.marker.PinElement({
              background: "#3B82F6",
              borderColor: "#2563EB",
              glyphColor: "#FFFFFF",
              scale: 1.3,
            })
            marker.content = highlightedPin.element
            marker.zIndex = 1000
          } else {
            const normalPin = new window.google.maps.marker.PinElement({
              background: "#EF4444",
              borderColor: "#DC2626",
              glyphColor: "#FFFFFF",
              scale: 1,
            })
            marker.content = normalPin.element
            marker.zIndex = 1
          }
        }
      } catch (error) {
        console.warn('Failed to update marker highlight:', error)
      }
    })
  }, [hoveredRestaurantId])

  // Visualize subdivisions in dev mode
  useEffect(() => {
    if (!mapInstanceRef.current || !showSubdivisions || polygonPoints.length !== 4 || !window.google?.maps) {
      // Clear existing visualizations
      subdivisionPolygonsRef.current.forEach(poly => poly.setMap(null))
      subdivisionPolygonsRef.current = []
      if (centroidMarkerRef.current) {
        centroidMarkerRef.current.setMap(null)
        centroidMarkerRef.current = null
      }
      return
    }

    // Clear existing visualizations
    subdivisionPolygonsRef.current.forEach(poly => poly.setMap(null))
    subdivisionPolygonsRef.current = []
    if (centroidMarkerRef.current) {
      centroidMarkerRef.current.setMap(null)
      centroidMarkerRef.current = null
    }

    // Calculate centroid
    const centroid = calculateCentroid(polygonPoints)

    // Create centroid marker
    const centroidDiv = document.createElement('div')
    centroidDiv.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="8" fill="#8B5CF6" stroke="white" stroke-width="2"/>
      </svg>
    `

    if (window.google.maps.marker?.AdvancedMarkerElement) {
      centroidMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: centroid,
        map: mapInstanceRef.current,
        content: centroidDiv,
      })
    }

    // Create initial triangles
    const initialTriangles = createTrianglesFromCentroid(polygonPoints)

    // Subdivide recursively
    const depth = subdivisionDepth ?? 2
    const allTriangles = subdivideTrianglesRecursively(initialTriangles, depth)

    // Draw all triangles
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
    allTriangles.forEach((triangle: Triangle, index: number) => {
      const color = colors[index % colors.length]
      const poly = new window.google.maps.Polygon({
        paths: triangle,
        strokeColor: color,
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: color,
        fillOpacity: 0.1,
        map: mapInstanceRef.current
      })
      subdivisionPolygonsRef.current.push(poly)
    })

    return () => {
      subdivisionPolygonsRef.current.forEach(poly => poly.setMap(null))
      subdivisionPolygonsRef.current = []
      if (centroidMarkerRef.current) {
        centroidMarkerRef.current.setMap(null)
        centroidMarkerRef.current = null
      }
    }
  }, [showSubdivisions, polygonPoints, subdivisionDepth])

  // Visualize active quadrants (being processed)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return

    // Clear previous active quadrant polygons
    activeQuadPolygonsRef.current.forEach(p => p.setMap(null))
    activeQuadPolygonsRef.current = []

    if (!activeQuadrants || activeQuadrants.length === 0) return

    // Draw active quadrants with colored borders
    const colors = ['#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6']
    activeQuadrants.forEach((quad, index) => {
      const color = colors[index % colors.length]
      const poly = new window.google.maps.Polygon({
        paths: quad,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 3,
        fillColor: color,
        fillOpacity: 0.15,
        map: mapInstanceRef.current
      })
      activeQuadPolygonsRef.current.push(poly)
    })

    return () => {
      activeQuadPolygonsRef.current.forEach(p => p.setMap(null))
      activeQuadPolygonsRef.current = []
    }
  }, [activeQuadrants])

  // Visualize completed quadrants
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return

    // Clear previous completed quadrant polygons
    completedQuadPolygonsRef.current.forEach(p => p.setMap(null))
    completedQuadPolygonsRef.current = []

    if (!completedQuadrants || completedQuadrants.length === 0) return

    // Draw completed quadrants with muted green
    completedQuadrants.forEach((quad) => {
      const poly = new window.google.maps.Polygon({
        paths: quad,
        strokeColor: '#10b981',
        strokeOpacity: 0.5,
        strokeWeight: 1,
        fillColor: '#10b981',
        fillOpacity: 0.08,
        map: mapInstanceRef.current
      })
      completedQuadPolygonsRef.current.push(poly)
    })

    return () => {
      completedQuadPolygonsRef.current.forEach(p => p.setMap(null))
      completedQuadPolygonsRef.current = []
    }
  }, [completedQuadrants])

  // Visualize progressive restaurant markers
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return

    // Clear previous progressive markers
    progressiveMarkersRef.current.forEach(m => m.setMap(null))
    progressiveMarkersRef.current = []

    if (!progressiveRestaurants || progressiveRestaurants.length === 0) return

    progressiveRestaurants.forEach((restaurant) => {
      if (!restaurant.gps_coordinates?.latitude || !restaurant.gps_coordinates?.longitude) return

      const position = {
        lat: restaurant.gps_coordinates.latitude,
        lng: restaurant.gps_coordinates.longitude
      }

      try {
        if (window.google.maps.marker?.PinElement && window.google.maps.marker?.AdvancedMarkerElement) {
          const pin = new window.google.maps.marker.PinElement({
            background: "#22c55e",  // Green for mock/discovered
            borderColor: "#16a34a",
            glyphColor: "#FFFFFF",
            scale: 0.9,
          })

          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: position,
            map: mapInstanceRef.current,
            title: restaurant.name,
            content: pin.element,
          })

          progressiveMarkersRef.current.push(marker)
        }
      } catch (error) {
        console.warn('Failed to create progressive marker:', error)
      }
    })

    return () => {
      progressiveMarkersRef.current.forEach(m => m.setMap(null))
      progressiveMarkersRef.current = []
    }
  }, [progressiveRestaurants])

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
  onPolygonValidation,
  clearPolygon,
  onPolygonCleared,
  isLocked,
  centerOffset,
  restaurants,
  showSubdivisions,
  subdivisionDepth,
  activeQuadrants,
  completedQuadrants,
  progressiveRestaurants,
  onZoomChange,
  onBoundsChange,
  hoveredRestaurantId,
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
        onPolygonValidation={onPolygonValidation}
        clearPolygon={clearPolygon}
        onPolygonCleared={onPolygonCleared}
        isLocked={isLocked}
        centerOffset={centerOffset}
        restaurants={restaurants}
        showSubdivisions={showSubdivisions}
        subdivisionDepth={subdivisionDepth}
        activeQuadrants={activeQuadrants}
        completedQuadrants={completedQuadrants}
        progressiveRestaurants={progressiveRestaurants}
        onZoomChange={onZoomChange}
        onBoundsChange={onBoundsChange}
        hoveredRestaurantId={hoveredRestaurantId}
      />
    </Wrapper>
  )
}