/**
 * Collection resolution utilities for Leaflet adapter
 * @module adapters/leaflet/utils/collections
 */

/**
 * Default geometry type to use for glyph positioning
 */
export const DEFAULT_GEOMETRY = "interpolated";

/**
 * Lookup table of collection retrieval functions by geometry type
 */
export const collectionRetrievers = {
  regular: (morpher) => morpher.getRegularFeatureCollection(),
  cartogram: (morpher) => morpher.getCartogramFeatureCollection(),
  interpolated: (morpher, factor) => morpher.getInterpolatedFeatureCollection(factor),
};

/**
 * Resolve a feature collection from various geometry specifications
 *
 * @param {Object} params
 * @param {Object} params.morpher - GeoMorpher instance
 * @param {string|Function} params.geometry - Geometry type or custom function
 * @param {number} params.morphFactor - Morph factor for interpolated geometry
 * @returns {Object} - GeoJSON FeatureCollection
 * @throws {Error} - If geometry type is unsupported
 */
export function resolveCollection({ morpher, geometry, morphFactor }) {
  const getter = collectionRetrievers[geometry];
  if (getter) {
    return getter(morpher, morphFactor);
  }
  if (typeof geometry === "function") {
    return geometry({ morpher, morphFactor });
  }
  throw new Error(
    `Unsupported geometry "${geometry}". Use "regular", "cartogram", "interpolated", or provide a function.`
  );
}
