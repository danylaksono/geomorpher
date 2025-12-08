/**
 * Shared geometry helpers for adapters
 * Provides utilities like flattenPositions common to adapters.
 */

export const flattenPositions = (geometry) => {
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
