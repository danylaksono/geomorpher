/**
 * Coordinate utilities for MapLibre adapter
 * @module adapters/maplibre/utils/coordinates
 */

const fallbackNamespace = typeof globalThis !== "undefined" ? globalThis.maplibregl : undefined;

/**
 * Check if a value is an HTMLElement
 */
export const isHTMLElement = (value) =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

/**
 * Extract a [lng, lat] pair from a feature. Prefers `feature.centroid`
 * when available, then falls back to a naive centroid calculation
 * based on the first polygon ring.
 *
 * @param {Object} feature - GeoJSON feature with geometry and optional centroid
 * @returns {[number, number]|null} - [lng, lat] pair or null if extraction fails
 */
export function toLngLat(feature) {
  if (!feature) return null;
  const centroid = Array.isArray(feature.centroid) ? feature.centroid : null;
  if (centroid && centroid.length >= 2) {
    const [lng, lat] = centroid;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }

  const geometry = feature.geometry;
  if (!geometry) return null;

  const extractRing = (geom) => {
    if (!geom) return [];
    if (geom.type === "Polygon") {
      return geom.coordinates?.[0] ?? [];
    }
    if (geom.type === "MultiPolygon") {
      return geom.coordinates?.[0]?.[0] ?? [];
    }
    return [];
  };

  const ring = extractRing(geometry);
  if (!Array.isArray(ring) || ring.length === 0) return null;

  const [sumLng, sumLat, count] = ring.reduce(
    (acc, coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return acc;
      const [lng, lat] = coord;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
      return [acc[0] + lng, acc[1] + lat, acc[2] + 1];
    },
    [0, 0, 0]
  );

  if (count === 0) return null;

  return [sumLng / count, sumLat / count];
}

const flattenPositions = (geometry) => {
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  if (!coordinates) return [];

  switch (type) {
    case "Point":
      return [coordinates];
    case "MultiPoint":
    case "LineString":
      return coordinates;
    case "MultiLineString":
      return coordinates.flat();
    case "Polygon":
      return coordinates.flat();
    case "MultiPolygon":
      return coordinates.flat(2);
    default:
      return [];
  }
};

/**
 * Calculate the pixel bounds of a feature at the current map zoom.
 *
 * @param {Object} feature - GeoJSON feature
 * @param {maplibregl.Map} map - MapLibre map instance
 * @param {Object} [maplibreNamespace=maplibregl] - Optional injected MapLibre namespace
 * @returns {Object|null} - Bounds with width, height, center (screen coords) and lngLatBounds
 */
export function getFeatureBoundsInPixels(feature, map, maplibreNamespace = fallbackNamespace) {
  if (!feature || !map) return null;
  if (!maplibreNamespace?.LngLatBounds) return null;

  const positions = flattenPositions(feature.geometry);
  if (!positions.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const bounds = new maplibreNamespace.LngLatBounds();

  for (const coord of positions) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    const [lng, lat] = coord;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    bounds.extend([lng, lat]);

    const point = map.project([lng, lat]);
    if (!point) continue;

    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }

  return {
    width: Math.abs(maxX - minX),
    height: Math.abs(maxY - minY),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    bounds,
  };
}
