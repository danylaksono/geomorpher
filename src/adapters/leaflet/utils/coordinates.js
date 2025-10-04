/**
 * Coordinate utilities for Leaflet adapter
 * @module adapters/leaflet/utils/coordinates
 */

/**
 * Check if a value is an HTMLElement
 */
export const isHTMLElement = (value) =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

/**
 * Extract a Leaflet-compatible [lat, lng] coordinate pair from a feature.
 * First tries the feature's centroid property, then falls back to computing
 * the centroid from the geometry.
 *
 * @param {Object} feature - GeoJSON feature with geometry and optional centroid
 * @returns {[number, number]|null} - [lat, lng] or null if extraction fails
 */
export function toLatLng(feature) {
  if (!feature) return null;
  const centroid = Array.isArray(feature.centroid) ? feature.centroid : null;
  if (centroid && centroid.length >= 2) {
    const [lng, lat] = centroid;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lat, lng];
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

  const [sumLng, sumLat] = ring.reduce(
    (acc, coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return acc;
      const [lng, lat] = coord;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
      return [acc[0] + lng, acc[1] + lat];
    },
    [0, 0]
  );

  const count = ring.filter((coord) =>
    Array.isArray(coord) && coord.length >= 2 && coord.every(Number.isFinite)
  ).length;

  if (count === 0) return null;

  return [sumLat / count, sumLng / count];
}
