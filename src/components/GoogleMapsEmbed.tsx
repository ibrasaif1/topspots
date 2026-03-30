'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Wrapper } from '@googlemaps/react-wrapper'
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer'
import type { Renderer } from '@googlemaps/markerclusterer'
import { isCounterClockwise, LEFT_SIDEBAR_FRACTION, RIGHT_SIDEBAR_FRACTION } from '@/lib/utils'
import type { CategoryId } from '@/config/filters'

// Theme constants for Google Maps inline styles (CSS variables aren't available here)
const THEME = {
  accent: '#2563EB',
  accentRgba75: 'rgba(37,99,235,0.75)',
  zinc50: '#fafafa',
  zinc800: '#27272a',
  zinc900: '#18181b',
  emerald: '#10b981',
  emeraldRgba75: 'rgba(16,185,129,0.75)',
  orange: '#f97316',
  amber: '#f59e0b',
  ratingGreen: '#059669',
  ratingGreenDark: '#34d399',
  detailGray: '#6b7280',
  detailGrayDark: '#a1a1aa',
  popularBorder: '#d97706',
} as const

// SVG paths for category icons (exact Lucide paths)
const CATEGORY_ICON_SVGS: Record<CategoryId, string> = {
  topspots: `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="currentColor"/>`,
  'hidden-gems': `<path d="M10.5 3 8 9l4 13 4-13-2.5-6" fill="currentColor" opacity="0.3"/><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" fill="currentColor"/><path d="M2 9h20" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.3"/>`,
  'on-the-come-up': `<path d="M16 7h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m22 7-8.5 8.5-5-5L2 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
}

function isDarkMode(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

type Point = { x: number; y: number }
function sign(p1: Point, p2: Point, p3: Point) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
}
function isPointInTriangle(pt: Point, v1: Point, v2: Point, v3: Point): boolean {
  const d1 = sign(pt, v1, v2), d2 = sign(pt, v2, v3), d3 = sign(pt, v3, v1)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

function getMarkerColors(highlighted: boolean, popular: boolean) {
  const dark = isDarkMode()
  const border = popular ? THEME.popularBorder : (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)')
  if (highlighted) {
    return dark
      ? { bg: THEME.accent, border, text: '#ffffff', shadow: '0 1px 3px rgba(0,0,0,0.12)', innerHighlight: '' }
      : { bg: THEME.accentRgba75, border, text: '#ffffff', shadow: '0 2px 8px rgba(0,0,0,0.1)', innerHighlight: ', inset 0 1px 0 rgba(255,255,255,0.4)' }
  }
  return dark
    ? { bg: THEME.zinc900, border, text: THEME.zinc50, shadow: '0 1px 3px rgba(0,0,0,0.12)', innerHighlight: '' }
    : { bg: 'rgba(255,255,255,0.65)', border, text: THEME.zinc900, shadow: '0 2px 8px rgba(0,0,0,0.1)', innerHighlight: ', inset 0 1px 0 rgba(255,255,255,0.4)' }
}

function getCategoryForRestaurant(rating: number, reviews: number): CategoryId {
  if (rating >= 4.8 && reviews >= 500 && reviews <= 999) return 'hidden-gems'
  if (rating >= 4.5 && reviews >= 1000) return 'topspots'
  return 'on-the-come-up'
}

function createCategoryMarkerElement(category: CategoryId, highlighted = false, popular = false): HTMLDivElement {
  const dark = isDarkMode()
  const colors = getMarkerColors(highlighted, popular)
  const size = highlighted ? 38 : 34
  const borderWidth = popular ? 2 : 1
  const div = document.createElement('div')
  div.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: ${colors.bg};
    ${dark ? '' : 'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);'}
    border: ${borderWidth}px solid ${colors.border};
    box-shadow: ${colors.shadow}${colors.innerHighlight};
    color: ${colors.text};
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    user-select: none;
  `
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${highlighted ? 18 : 16}" height="${highlighted ? 18 : 16}" viewBox="0 0 24 24" fill="none" stroke="none" style="color: ${colors.text}">${CATEGORY_ICON_SVGS[category]}</svg>`
  return div
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
  zoom?: number
  // Viewport tracking props
  onZoomChange?: (zoom: number) => void
  onBoundsChange?: (bounds: Bounds) => void
  hoveredRestaurantId?: string | null
  rightSidebarVisible?: boolean
  resetView?: boolean
  onViewReset?: () => void
  showHeatmap?: boolean
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
  zoom,
  onZoomChange,
  onBoundsChange,
  hoveredRestaurantId,
  rightSidebarVisible,
  resetView,
  onViewReset,
  showHeatmap,
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
  zoom?: number
  onZoomChange?: (zoom: number) => void
  onBoundsChange?: (bounds: Bounds) => void
  hoveredRestaurantId?: string | null
  rightSidebarVisible?: boolean
  resetView?: boolean
  onViewReset?: () => void
  showHeatmap?: boolean
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantMarkersRef = useRef<Map<string, any>>(new Map())
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markerEventDataRef = useRef<Map<string, {
    showInfoWindow: () => void
    hideInfoWindow: (e?: MouseEvent) => void
    googleMapsUrl: string
    category: CategoryId
    popular: boolean
  }>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null)
  const safeTriangleMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const sidebarHoverActiveRef = useRef<boolean>(false)
  const prevHoveredIdRef = useRef<string | null>(null)
  const zoomRef = useRef<number>(zoom ?? 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonRef = useRef<any>(null)
  const rightSidebarVisibleRef = useRef<boolean>(rightSidebarVisible ?? false)
  // Stable refs for props used inside map event listeners — avoids re-creating the map
  const isLockedRef = useRef(isLocked)
  const onPolygonChangeRef = useRef(onPolygonChange)
  const onPolygonValidationRef = useRef(onPolygonValidation)
  const onZoomChangeRef = useRef(onZoomChange)
  const onBoundsChangeRef = useRef(onBoundsChange)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rebuildMarkersRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPolygonColorsRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapRef = useRef<any>(null)
  useEffect(() => { zoomRef.current = zoom ?? 0 }, [zoom])
  useEffect(() => { rightSidebarVisibleRef.current = rightSidebarVisible ?? false }, [rightSidebarVisible])
  useEffect(() => { isLockedRef.current = isLocked }, [isLocked])
  useEffect(() => { onPolygonChangeRef.current = onPolygonChange }, [onPolygonChange])
  useEffect(() => { onPolygonValidationRef.current = onPolygonValidation }, [onPolygonValidation])
  useEffect(() => { onZoomChangeRef.current = onZoomChange }, [onZoomChange])
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange }, [onBoundsChange])
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setColorScheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<{lat: number, lng: number}[]>([])

  // Compute visible bounds excluding sidebar areas
  // Pixel-to-longitude is linear in Mercator, so we can shrink the lng range proportionally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getVisibleBounds = useCallback((map: any): Bounds | null => {
    const bounds = map.getBounds()
    if (!bounds) return null
    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()
    const fullWest = sw.lng()
    const fullEast = ne.lng()
    const lngRange = fullEast - fullWest

    const leftFraction = LEFT_SIDEBAR_FRACTION
    const rightFraction = rightSidebarVisibleRef.current ? RIGHT_SIDEBAR_FRACTION : 0

    return {
      north: ne.lat(),
      south: sw.lat(),
      west: fullWest + lngRange * leftFraction,
      east: fullEast - lngRange * rightFraction,
    }
  }, [])

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
      return { strokeColor: THEME.emerald, fillColor: THEME.emerald, fillOpacity: 0.15 };
    }

    if (points.length >= 3) {
      const isValid = isCounterClockwise(points);
      if (!isValid) {
        return { strokeColor: THEME.orange, fillColor: THEME.orange, fillOpacity: 0.2 };
      }
    }

    return { strokeColor: THEME.accent, fillColor: THEME.accent, fillOpacity: 0.2 };
  }, [isLocked]);
  getPolygonColorsRef.current = getPolygonColors

  // Create marker HTML element
  const createMarkerElement = useCallback((number: number) => {
    const dark = isDarkMode()
    const div = document.createElement('div')
    if (dark) {
      div.style.cssText = `
        width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
        border-radius: 9999px; background: ${isLocked ? THEME.emerald : THEME.zinc900};
        border: 1px solid rgba(255,255,255,0.5);
        box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        color: ${isLocked ? '#ffffff' : THEME.zinc50}; font-size: 13px; font-weight: 600;
        user-select: none;
      `
    } else {
      div.style.cssText = `
        width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
        border-radius: 9999px; background: ${isLocked ? THEME.emeraldRgba75 : 'rgba(255,255,255,0.65)'};
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0,0,0,0.3);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.4);
        color: ${isLocked ? '#ffffff' : THEME.zinc900}; font-size: 13px; font-weight: 600;
        user-select: none;
      `
    }
    div.textContent = String(number)
    return div
  }, [isLocked, colorScheme])

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
  rebuildMarkersRef.current = rebuildMarkers

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || mapInstanceRef.current) return

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 35, lng: 240 },
      zoom: 4,
      minZoom: 3,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
      mapId: "2ddce5326308b2176661a3da",
      colorScheme: colorScheme === 'dark' ? 'DARK' : 'LIGHT',
    })

    mapInstanceRef.current = map

    // Debounce helper for bounds changes
    let boundsTimeout: NodeJS.Timeout | null = null
    const debouncedBoundsChange = () => {
      if (boundsTimeout) clearTimeout(boundsTimeout)
      boundsTimeout = setTimeout(() => {
        const visibleBounds = getVisibleBounds(map)
        if (visibleBounds && onBoundsChangeRef.current) {
          onBoundsChangeRef.current(visibleBounds)
        }
      }, 150) // Debounce by 150ms
    }

    // Zoom change listener
    map.addListener('zoom_changed', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zoom = (map as any).getZoom()
      if (zoom !== undefined && onZoomChangeRef.current) {
        onZoomChangeRef.current(zoom)
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
      if (zoom !== undefined && onZoomChangeRef.current) {
        onZoomChangeRef.current(zoom)
      }
      const visibleBounds = getVisibleBounds(map)
      if (visibleBounds && onBoundsChangeRef.current) {
        onBoundsChangeRef.current(visibleBounds)
      }
    })

    // Handle map clicks to add polygon points
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addListener('click', (e: any) => {
      if (isLockedRef.current || !e.latLng) return

      const clickedLat = e.latLng.lat()
      const clickedLng = e.latLng.lng()
      const newPoint = { lat: clickedLat, lng: clickedLng }

      setPolygonPoints(prev => {
        if (prev.length >= 4) return prev

        const updated = [...prev, newPoint]

        if (updated.length >= 3) {
          const colors = getPolygonColorsRef.current(updated);
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

        rebuildMarkersRef.current(updated)

        onPolygonChangeRef.current?.(updated)

        // Notify parent about validation status
        if (updated.length >= 3) {
          onPolygonValidationRef.current?.(isCounterClockwise(updated))
        } else {
          onPolygonValidationRef.current?.(true) // Not enough points = valid by default
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
      mapInstanceRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getVisibleBounds])

  // Update color scheme without recreating the map
  useEffect(() => {
    if (!mapInstanceRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mapInstanceRef.current as any).setOptions({
      colorScheme: colorScheme === 'dark' ? 'DARK' : 'LIGHT',
    })
  }, [colorScheme])
  
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
        strokeColor: THEME.emerald,
        strokeOpacity: 0.8,
        strokeWeight: 3,
        fillColor: THEME.emerald,
        fillOpacity: 0.15,
        map: mapInstanceRef.current
      })
      polygonRef.current = lockedPolygon
      
      // Rebuild markers with green color
      rebuildMarkers(polygonPoints)
    }
  }, [isLocked, polygonPoints, rebuildMarkers])

  // Rebuild polygon point markers when color scheme changes
  useEffect(() => {
    if (polygonPoints.length > 0 && mapInstanceRef.current) {
      rebuildMarkers(polygonPoints)
    }
  }, [colorScheme, rebuildMarkers, polygonPoints])

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

  // Handle reset view to initial state
  useEffect(() => {
    if (resetView && mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat: 35, lng: 240 })
      mapInstanceRef.current.setZoom(4)
      onViewReset?.()
    }
  }, [resetView, onViewReset])

  // Add restaurant markers with clustering
  useEffect(() => {
    if (!mapInstanceRef.current || !restaurants || restaurants.length === 0 || !window.google?.maps) return

    // Clear old clusterer and markers
    if (clustererRef.current) {
      clustererRef.current.clearMarkers()
      clustererRef.current = null
    }
    restaurantMarkersRef.current.forEach(marker => marker.setMap(null))
    restaurantMarkersRef.current.clear()
    markerEventDataRef.current.clear()

    // Clear old heatmap
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null)
      heatmapRef.current = null
    }

    if (showHeatmap) {
      const getVisibleHeatmapData = () => {
        const mapBounds = mapInstanceRef.current.getBounds()
        return restaurants
          .filter(r => {
            if (!r.gps_coordinates?.latitude || !r.gps_coordinates?.longitude) return false
            if (!mapBounds) return true
            return mapBounds.contains({ lat: r.gps_coordinates.latitude, lng: r.gps_coordinates.longitude })
          })
          .map(r => ({
            location: new window.google.maps.LatLng(
              r.gps_coordinates.latitude,
              r.gps_coordinates.longitude
            ),
            weight: r.reviews,
          }))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      heatmapRef.current = new (window.google.maps as any).visualization.HeatmapLayer({
        data: getVisibleHeatmapData(),
        map: mapInstanceRef.current,
        radius: 30,
      })

      let boundsTimeout: NodeJS.Timeout | null = null
      const boundsListener = mapInstanceRef.current.addListener('bounds_changed', () => {
        if (boundsTimeout) clearTimeout(boundsTimeout)
        boundsTimeout = setTimeout(() => {
          if (heatmapRef.current) {
            heatmapRef.current.setData(getVisibleHeatmapData())
          }
        }, 150)
      })

      return () => {
        if (boundsTimeout) clearTimeout(boundsTimeout)
        window.google.maps.event.removeListener(boundsListener)
        if (heatmapRef.current) {
          heatmapRef.current.setMap(null)
          heatmapRef.current = null
        }
      }
    }

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allMarkers: any[] = []

    restaurants.forEach((restaurant) => {
      if (!restaurant.gps_coordinates?.latitude || !restaurant.gps_coordinates?.longitude) return

      const position = {
        lat: restaurant.gps_coordinates.latitude,
        lng: restaurant.gps_coordinates.longitude
      }

      const category = getCategoryForRestaurant(restaurant.rating, restaurant.reviews)
      const popular = restaurant.reviews >= 10000
      const markerEl = createCategoryMarkerElement(category, false, popular)

      // Don't set map — the clusterer manages map attachment
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: position,
        title: restaurant.name,
        content: markerEl,
      })

      // Build info window content
      const detailParts: string[] = []
      if (restaurant.cuisine) detailParts.push(escapeHtml(restaurant.cuisine))
      if (restaurant.priceRange) detailParts.push(escapeHtml(restaurant.priceRange))

      const cleanPlaceId = restaurant.place_id.replace('places/', '')
      const googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${cleanPlaceId}`

      const iwDark = colorScheme === 'dark'
      const iwNameColor = iwDark ? THEME.zinc50 : '#111827'
      const iwRatingColor = iwDark ? THEME.ratingGreenDark : THEME.ratingGreen
      const iwDetailColor = iwDark ? THEME.detailGrayDark : THEME.detailGray

      const content = `
        <div style="
          padding: 0;
          margin: 0;
          max-width: 260px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.3;
          cursor: pointer;
        " onclick="window.open('${googleMapsUrl}', '_blank')">
          <div style="font-weight: 600; font-size: 15px; color: ${iwNameColor}; margin: 0 0 6px 0;">
            ${escapeHtml(restaurant.name)}
          </div>

          ${restaurant.rating ? `<div style="color: ${iwRatingColor}; margin: 0 0 4px 0; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 3px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${THEME.amber}" stroke="none"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>${restaurant.rating.toFixed(1)} · ${(Math.floor((restaurant.reviews ?? 0) / 100) * 100).toLocaleString()}+ reviews</div>` : ""}

          ${detailParts.length ? `<div style="color: ${iwDetailColor}; font-size: 12px; margin: 0;">${detailParts.join(" · ")}</div>` : ""}
        </div>
      `

      const showInfoWindow = () => {
        if (zoomRef.current < 10) return

        // Cancel any active safe-triangle tracking from a previous marker
        if (safeTriangleMoveHandlerRef.current) {
          document.removeEventListener('mousemove', safeTriangleMoveHandlerRef.current)
          safeTriangleMoveHandlerRef.current = null
        }

        if (!infoWindowRef.current) {
          infoWindowRef.current = new window.google.maps.InfoWindow({ zIndex: 2000, disableAutoPan: false })
        }
        infoWindowRef.current.setContent(content)
        infoWindowRef.current.open(mapInstanceRef.current, marker)
      }

      const hideInfoWindow = (e?: MouseEvent) => {
        if (sidebarHoverActiveRef.current) return

        // Programmatic call (sidebar un-hover, no mouse event) — close immediately
        if (!e) {
          if (infoWindowRef.current) infoWindowRef.current.close()
          return
        }

        // Mouse-triggered — use safe triangle to keep IW open while cursor travels toward it
        const iwEl = document.querySelector('.gm-style-iw-c')
        if (!iwEl || !infoWindowRef.current?.isOpen) {
          if (infoWindowRef.current) infoWindowRef.current.close()
          return
        }

        const exitPos = { x: e.clientX, y: e.clientY }
        const rect = iwEl.getBoundingClientRect()
        const triA = exitPos
        const triB = { x: rect.left, y: rect.bottom }
        const triC = { x: rect.right, y: rect.bottom }

        let arrivedAtIW = false

        const onMouseMove = (ev: MouseEvent) => {
          const cursor = { x: ev.clientX, y: ev.clientY }
          const freshRect = iwEl.getBoundingClientRect()
          const insideIW =
            cursor.x >= freshRect.left && cursor.x <= freshRect.right &&
            cursor.y >= freshRect.top && cursor.y <= freshRect.bottom

          if (insideIW) {
            arrivedAtIW = true
            return // Cursor is on the infowindow — stay open
          }

          if (arrivedAtIW) {
            // Cursor was on infowindow and has now left — close
            cleanup()
            if (infoWindowRef.current) infoWindowRef.current.close()
            return
          }

          if (!isPointInTriangle(cursor, triA, triB, triC)) {
            // Cursor has left the safe triangle without reaching IW — close immediately
            cleanup()
            if (infoWindowRef.current) infoWindowRef.current.close()
          }
        }

        const cleanup = () => {
          document.removeEventListener('mousemove', onMouseMove)
          safeTriangleMoveHandlerRef.current = null
        }

        safeTriangleMoveHandlerRef.current = onMouseMove
        document.addEventListener('mousemove', onMouseMove)
      }

      // Add hover and click listeners
      const markerElement = marker.content as HTMLElement | null
      if (markerElement) {
        markerElement.addEventListener('mouseenter', showInfoWindow)
        markerElement.addEventListener('mouseleave', hideInfoWindow)
        markerElement.addEventListener('click', (e: Event) => {
          e.stopPropagation()
          window.open(googleMapsUrl, '_blank')
        })
        markerElement.style.cursor = 'pointer'
      }

      // Store event data for re-attaching after hover highlight swaps content
      markerEventDataRef.current.set(restaurant.place_id, {
        showInfoWindow,
        hideInfoWindow,
        googleMapsUrl,
        category,
        popular,
      })

      restaurantMarkersRef.current.set(restaurant.place_id, marker)
      allMarkers.push(marker)
    })

    // Custom cluster renderer — 3-ring Google-style halo
    const clusterRenderer: Renderer = {
      render({ count, position }) {
        const innerSize = Math.min(46, 30 + Math.log2(count) * 4)
        const midSize = innerSize + 14
        const outerSize = innerSize + 28

        const outer = document.createElement('div')
        outer.style.cssText = `
          width: ${outerSize}px;
          height: ${outerSize}px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: rgba(37, 99, 235, 0.12);
          cursor: pointer;
          transform: translateY(${outerSize / 2}px);
          user-select: none;
          transition: background 0.15s ease;
        `

        const mid = document.createElement('div')
        mid.style.cssText = `
          width: ${midSize}px;
          height: ${midSize}px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: rgba(37, 99, 235, 0.25);
          transition: background 0.15s ease;
        `

        const inner = document.createElement('div')
        inner.style.cssText = `
          width: ${innerSize}px;
          height: ${innerSize}px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: ${THEME.accent};
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.45);
          transition: background 0.15s ease, box-shadow 0.15s ease;
        `
        inner.textContent = String(count)
        mid.appendChild(inner)
        outer.appendChild(mid)

        outer.addEventListener('mouseenter', () => {
          outer.style.background = 'rgba(37, 99, 235, 0.18)'
          mid.style.background = 'rgba(37, 99, 235, 0.35)'
          inner.style.background = '#1d4ed8'
          inner.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.55)'
        })
        outer.addEventListener('mouseleave', () => {
          outer.style.background = 'rgba(37, 99, 235, 0.12)'
          mid.style.background = 'rgba(37, 99, 235, 0.25)'
          inner.style.background = THEME.accent
          inner.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.45)'
        })

        return new window.google.maps.marker.AdvancedMarkerElement({
          position,
          content: outer,
          zIndex: 999999 + count,
        })
      },
    }

    // Create clusterer — maxZoom:9 means zoom 10+ shows individual markers
    clustererRef.current = new MarkerClusterer({
      map: mapInstanceRef.current,
      markers: allMarkers,
      algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 13 }),
      renderer: clusterRenderer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onClusterClick: (_: any, cluster: any, map: any) => {
        const currentZoom = map.getZoom() ?? 0
        map.setCenter(cluster.position)
        map.setZoom(currentZoom + 2)
      },
    })

    const currentRestaurantMarkers = restaurantMarkersRef.current
    const currentMarkerEventData = markerEventDataRef.current

    return () => {
      if (clustererRef.current) {
        clustererRef.current.clearMarkers()
        clustererRef.current = null
      }
      currentRestaurantMarkers.forEach(marker => marker.setMap(null))
      currentRestaurantMarkers.clear()
      currentMarkerEventData.clear()
      if (infoWindowRef.current) {
        infoWindowRef.current.close()
      }
      if (safeTriangleMoveHandlerRef.current) {
        document.removeEventListener('mousemove', safeTriangleMoveHandlerRef.current)
        safeTriangleMoveHandlerRef.current = null
      }
    }
  }, [restaurants, colorScheme, showHeatmap])

  // Handle marker highlighting when hoveredRestaurantId changes
  useEffect(() => {
    if (!window.google?.maps) return

    sidebarHoverActiveRef.current = !!hoveredRestaurantId
    const prevId = prevHoveredIdRef.current
    prevHoveredIdRef.current = hoveredRestaurantId ?? null

    // Only update the marker being un-hovered and the one being hovered
    const idsToUpdate = new Set<string>()
    if (prevId) idsToUpdate.add(prevId)
    if (hoveredRestaurantId) idsToUpdate.add(hoveredRestaurantId)

    for (const placeId of idsToUpdate) {
      const marker = restaurantMarkersRef.current.get(placeId)
      const eventData = markerEventDataRef.current.get(placeId)
      if (!marker || !eventData) continue

      const isHovered = placeId === hoveredRestaurantId

      try {
        const newContent = createCategoryMarkerElement(eventData.category, isHovered, eventData.popular)
        marker.content = newContent
        marker.zIndex = isHovered ? 1000 : 1

        // Show/hide info window when hovered from sidebar
        if (isHovered) {
          eventData.showInfoWindow()
        } else {
          eventData.hideInfoWindow()
        }

        // Re-attach event listeners since content was replaced
        const el = marker.content as HTMLElement | null
        if (el) {
          el.addEventListener('mouseenter', eventData.showInfoWindow)
          el.addEventListener('mouseleave', eventData.hideInfoWindow)
          el.addEventListener('click', (e: Event) => {
            e.stopPropagation()
            window.open(eventData.googleMapsUrl, '_blank')
          })
          el.style.cursor = 'pointer'
        }
      } catch (error) {
        console.warn('Failed to update marker highlight:', error)
      }
    }
  }, [hoveredRestaurantId])

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
  zoom,
  onZoomChange,
  onBoundsChange,
  hoveredRestaurantId,
  rightSidebarVisible,
  resetView,
  onViewReset,
  showHeatmap,
}: GoogleMapsEmbedProps) {
  return (
    <Wrapper
      apiKey={process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_FRONTEND_API_KEY || ''
        : process.env.NEXT_PUBLIC_DEV_KEY || process.env.NEXT_PUBLIC_FRONTEND_API_KEY || ''}
      libraries={["marker", "visualization"]}
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
        zoom={zoom}
        onZoomChange={onZoomChange}
        onBoundsChange={onBoundsChange}
        hoveredRestaurantId={hoveredRestaurantId}
        rightSidebarVisible={rightSidebarVisible}
        resetView={resetView}
        onViewReset={onViewReset}
        showHeatmap={showHeatmap}
      />
    </Wrapper>
  )
}