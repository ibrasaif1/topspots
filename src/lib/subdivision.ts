export type Point = { lat: number; lng: number };

// Get midpoint between two points
function midpoint(p1: Point, p2: Point): Point {
  return {
    lat: (p1.lat + p2.lat) / 2,
    lng: (p1.lng + p2.lng) / 2
  };
}

// Get centroid of a polygon
function centroid(points: Point[]): Point {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  };
}

/**
 * Split a 4-point polygon into 4 quadrants
 *
 * Given points [A, B, C, D] arranged as:
 *   A --- B
 *   |     |
 *   D --- C
 *
 * Returns 4 smaller quadrilaterals
 */
export function subdivideQuad(polygon: Point[]): Point[][] {
  if (polygon.length !== 4) {
    throw new Error('subdivideQuad requires exactly 4 points');
  }

  const [a, b, c, d] = polygon;

  // Midpoints of each edge
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const cd = midpoint(c, d);
  const da = midpoint(d, a);

  // Center of the quad
  const center = centroid(polygon);

  // 4 quadrants (each is a 4-point polygon)
  return [
    [a, ab, center, da],      // top-left
    [ab, b, bc, center],      // top-right
    [center, bc, c, cd],      // bottom-right
    [da, center, cd, d]       // bottom-left
  ];
}

// Close a polygon by adding the first point at the end (for API calls)
export function closePolygon(polygon: Point[]): Point[] {
  return [...polygon, polygon[0]];
}

// Convert from {lat, lng} to {latitude, longitude} format for Google API
export function toGoogleFormat(polygon: Point[]): { latitude: number; longitude: number }[] {
  return polygon.map(p => ({ latitude: p.lat, longitude: p.lng }));
}
