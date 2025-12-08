/**
 * Shared collection resolution utilities for adapters
 * This module centralises the default geometry and resolveCollection logic
 * that previously lived in the Leaflet-specific utilities, to avoid
 * cross-adapter coupling.
 */

export const DEFAULT_GEOMETRY = "interpolated";

export const collectionRetrievers = {
  regular: (morpher) => morpher.getRegularFeatureCollection(),
  cartogram: (morpher) => morpher.getCartogramFeatureCollection(),
  interpolated: (morpher, factor) => morpher.getInterpolatedFeatureCollection(factor),
};

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
