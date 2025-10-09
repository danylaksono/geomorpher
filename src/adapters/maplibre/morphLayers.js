/**
 * MapLibre morph layer integration.
 *
 * Creates three GeoJSON sources (regular, cartogram, interpolated) and
 * corresponding fill layers that can be morphed by updating the tween source.
 */


const DEFAULT_BASE_ID = "geomorpher";

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return value;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
};

const normalizeRangeSpec = (spec, original) => {
  if (spec == null) return null;
  if (Array.isArray(spec) && spec.length >= 2) {
    return [spec[0], spec[1]];
  }
  if (typeof spec === "object") {
    const { from, to } = spec;
    if (typeof from !== "undefined" || typeof to !== "undefined") {
      return [typeof from !== "undefined" ? from : original, typeof to !== "undefined" ? to : original];
    }
  }
  if (typeof spec === "number" && Number.isFinite(spec)) {
    return [original, spec];
  }
  return null;
};

const interpolateRange = ({ range, factor, original }) => {
  if (!Array.isArray(range) || range.length < 2) return original;
  const [start, end] = range;
  const startValue = typeof start !== "undefined" ? start : original;
  const endValue = typeof end !== "undefined" ? end : original;

  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
    return factor >= 1 ? endValue : startValue;
  }

  return startValue + (endValue - startValue) * factor;
};

const identity = (value) => value;

const ensureArray = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const warnOnce = (() => {
  const seen = new Set();
  return ({ scope, message }) => {
    const key = `${scope}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    console.warn(`geo-morpher:createMapLibreMorphLayers ${message}`);
  };
})();

const createBasemapEffectApplier = ({ map, effect }) => {
  if (!effect) {
    return {
      apply: () => {},
      reset: () => {},
    };
  }

  const resolveLayers = () => {
    const { layers } = effect;
    if (typeof layers === "function") {
      try {
        return ensureArray(layers({ map }));
      } catch (error) {
        warnOnce({ scope: "basemap", message: `failed to resolve effect layers: ${error?.message ?? error}` });
        return [];
      }
    }
    return ensureArray(layers);
  };

  const baseProperties = effect.properties ?? {};
  const perLayerProperties = effect.layerProperties ?? {};
  const propertyClamp = effect.propertyClamp ?? {};
  const propertyTransforms = effect.propertyTransforms ?? {};
  const globalClamp = Array.isArray(effect.clamp) ? effect.clamp : null;
  const easing = typeof effect.easing === "function" ? effect.easing : identity;
  const isEnabled = effect.isEnabled;
  const resetOnDisable = effect.resetOnDisable !== false;

  const originals = new Map();

  const captureOriginal = ({ layerId, property }) => {
    const key = `${layerId}::${property}`;
    if (originals.has(key)) {
      return originals.get(key);
    }

    try {
      const value = map.getPaintProperty(layerId, property);
      originals.set(key, value);
      return value;
    } catch (error) {
      warnOnce({ scope: "basemap", message: `cannot read paint property "${property}" on layer "${layerId}": ${error?.message ?? error}` });
      originals.set(key, undefined);
      return undefined;
    }
  };

  const setPaintProperty = ({ layerId, property, value }) => {
    if (!map.getLayer(layerId)) {
      warnOnce({ scope: "basemap", message: `layer "${layerId}" not found when applying basemap effect` });
      return;
    }

    try {
      map.setPaintProperty(layerId, property, value);
    } catch (error) {
      warnOnce({ scope: "basemap", message: `failed to set paint property "${property}" on layer "${layerId}": ${error?.message ?? error}` });
    }
  };

  const computePropertyValue = ({ layerId, property, spec, easedFactor }) => {
    const original = captureOriginal({ layerId, property });

    if (typeof spec === "function") {
      try {
        const next = spec({
          layerId,
          property,
          factor: easedFactor,
          original,
          map,
        });
        return { value: next, original };
      } catch (error) {
        warnOnce({ scope: "basemap", message: `error computing paint property "${property}" for layer "${layerId}": ${error?.message ?? error}` });
        return { value: original, original };
      }
    }

    const range = normalizeRangeSpec(spec, original);
    if (!range) {
      return { value: original, original };
    }

    const value = interpolateRange({ range, factor: easedFactor, original });
    return { value, original };
  };

  const applyClampAndTransform = ({ layerId, property, value, factor, original }) => {
    const propertyRange = propertyClamp[property];
    const clampRange = propertyRange ?? globalClamp;
    let nextValue = value;

    if (Array.isArray(clampRange) && clampRange.length >= 2 && Number.isFinite(nextValue)) {
      nextValue = clamp(nextValue, clampRange[0], clampRange[1]);
    }

    const transform = propertyTransforms[property];
    if (typeof transform === "function") {
      try {
        return transform({ value: nextValue, factor, original, layerId, map });
      } catch (error) {
        warnOnce({ scope: "basemap", message: `transform failed for property "${property}" on layer "${layerId}": ${error?.message ?? error}` });
        return nextValue;
      }
    }

    return nextValue;
  };

  const apply = (factor) => {
    const layers = resolveLayers();
    if (!layers.length) return;

    const easingResult = easing(factor);
    const easedFactor = clamp(easingResult, 0, 1);

    const enabled = typeof isEnabled === "function" ? !!isEnabled({ factor, easedFactor, map }) : isEnabled !== false;

    for (const layerId of layers) {
      const mergedProperties = {
        ...baseProperties,
        ...(perLayerProperties?.[layerId] ?? {}),
      };

      for (const [property, spec] of Object.entries(mergedProperties)) {
        const { value, original } = computePropertyValue({
          layerId,
          property,
          spec,
          easedFactor,
        });

        if (!enabled) {
          if (resetOnDisable && typeof original !== "undefined") {
            setPaintProperty({ layerId, property, value: original });
          }
          continue;
        }

        const nextValue = applyClampAndTransform({
          layerId,
          property,
          value,
          factor: easedFactor,
          original,
        });

        if (typeof nextValue === "undefined") continue;

        setPaintProperty({ layerId, property, value: nextValue });
      }
    }
  };

  const reset = () => {
    originals.forEach((value, key) => {
      if (typeof value === "undefined") return;
      const [layerId, property] = key.split("::");
      setPaintProperty({ layerId, property, value });
    });
  };

  return { apply, reset };
};

const DEFAULT_STYLES = {
  regular: {
    type: "fill",
    paint: {
      "fill-color": "#1f77b4",
      "fill-opacity": 0.4,
      "fill-outline-color": "#1f77b4",
    },
  },
  cartogram: {
    type: "fill",
    paint: {
      "fill-color": "#ff7f0e",
      "fill-opacity": 0.35,
      "fill-outline-color": "#ff7f0e",
    },
  },
  interpolated: {
    type: "fill",
    paint: {
      "fill-color": "#2ca02c",
      "fill-opacity": 0.6,
      "fill-outline-color": "#2ca02c",
    },
  },
};

const buildLayerSpec = ({ id, source, style = {}, defaults }) => {
  const layer = {
    id,
    type: style.type ?? defaults.type ?? "fill",
    source,
    paint: {
      ...(defaults.paint ?? {}),
      ...(style.paint ?? {}),
    },
    layout: {
      visibility: "visible",
      ...(style.layout ?? {}),
    },
  };

  if (style.metadata) layer.metadata = style.metadata;
  if (style.filter) layer.filter = style.filter;
  if (typeof style.minzoom === "number") layer.minzoom = style.minzoom;
  if (typeof style.maxzoom === "number") layer.maxzoom = style.maxzoom;

  return layer;
};

const addOrUpdateSource = ({ map, id, data }) => {
  const existing = map.getSource(id);
  if (existing) {
    if (typeof existing.setData === "function") {
      existing.setData(data);
    }
    return existing;
  }

  map.addSource(id, {
    type: "geojson",
    data,
  });

  return map.getSource(id);
};

const addLayers = ({ map, layers, beforeId }) => {
  for (const layer of layers) {
    if (!layer || !layer.id) continue;
    if (map.getLayer(layer.id)) continue;
    map.addLayer(layer, beforeId ?? layer.beforeId ?? undefined);
  }
};

/**
 * Create MapLibre layers that mirror geo-morpher collections.
 *
 * @param {Object} params
 * @param {Object} params.morpher - Prepared GeoMorpher instance
 * @param {maplibregl.Map} params.map - MapLibre map instance
 * @param {number} [params.morphFactor=0] - Initial morph factor
 * @param {string} [params.idBase="geomorpher"] - Base identifier for sources/layers
 * @param {Object} [params.regularStyle] - MapLibre layer overrides for regular geography
 * @param {Object} [params.cartogramStyle] - MapLibre layer overrides for cartogram geography
 * @param {Object} [params.interpolatedStyle] - MapLibre layer overrides for tweened geography
 * @param {string} [params.beforeId] - Insert new layers before this layer id
 * @returns {Promise<Object>} - Controller with update/remove helpers
 */
export async function createMapLibreMorphLayers({
  morpher,
  map,
  morphFactor = 0,
  idBase = DEFAULT_BASE_ID,
  regularStyle = {},
  cartogramStyle = {},
  interpolatedStyle = {},
  beforeId,
  basemapEffect,
} = {}) {
  if (!morpher || !map) {
    throw new Error("Both morpher and MapLibre map are required");
  }

  if (!morpher.isPrepared()) {
    await morpher.prepare();
  }

  const sourceIds = {
    regular: `${idBase}-regular-source`,
    cartogram: `${idBase}-cartogram-source`,
    interpolated: `${idBase}-interpolated-source`,
  };

  const layerIds = {
    regular: `${idBase}-regular-layer`,
    cartogram: `${idBase}-cartogram-layer`,
    interpolated: `${idBase}-interpolated-layer`,
  };

  const regularCollection = morpher.getRegularFeatureCollection();
  const cartogramCollection = morpher.getCartogramFeatureCollection();
  const interpolatedCollection = morpher.getInterpolatedFeatureCollection(morphFactor);

  addOrUpdateSource({ map, id: sourceIds.regular, data: regularCollection });
  addOrUpdateSource({ map, id: sourceIds.cartogram, data: cartogramCollection });
  addOrUpdateSource({ map, id: sourceIds.interpolated, data: interpolatedCollection });

  const layers = [
    buildLayerSpec({
      id: layerIds.regular,
      source: sourceIds.regular,
      style: regularStyle,
      defaults: DEFAULT_STYLES.regular,
    }),
    buildLayerSpec({
      id: layerIds.cartogram,
      source: sourceIds.cartogram,
      style: cartogramStyle,
      defaults: DEFAULT_STYLES.cartogram,
    }),
    buildLayerSpec({
      id: layerIds.interpolated,
      source: sourceIds.interpolated,
      style: interpolatedStyle,
      defaults: DEFAULT_STYLES.interpolated,
    }),
  ];

  addLayers({ map, layers, beforeId });

  let currentMorphFactor = morphFactor;
  const basemapController = createBasemapEffectApplier({ map, effect: basemapEffect });
  basemapController.apply(currentMorphFactor);

  const updateMorphFactor = (nextFactor) => {
    if (!Number.isFinite(nextFactor)) {
      throw new Error("Morph factor must be a finite number");
    }

    const collection = morpher.getInterpolatedFeatureCollection(nextFactor);
    const source = map.getSource(sourceIds.interpolated);
    if (!source || typeof source.setData !== "function") {
      throw new Error(`Interpolated source \"${sourceIds.interpolated}\" is missing or cannot be updated`);
    }

    source.setData(collection);
    currentMorphFactor = nextFactor;
    basemapController.apply(nextFactor);
    map.triggerRepaint?.();
    return collection;
  };

  const setVisibility = (layerId, visibility) => {
    const layer = map.getLayer(layerId);
    if (!layer) return;
    map.setLayoutProperty(layerId, "visibility", visibility);
  };

  const setLayerVisibility = ({ regular, cartogram, interpolated }) => {
    const toVisibility = (value) => {
      if (value === true) return "visible";
      if (value === false) return "none";
      if (value === "visible" || value === "none") return value;
      return undefined;
    };

    const regularVisibility = toVisibility(regular);
    const cartogramVisibility = toVisibility(cartogram);
    const interpolatedVisibility = toVisibility(interpolated);

    if (regularVisibility) setVisibility(layerIds.regular, regularVisibility);
    if (cartogramVisibility) setVisibility(layerIds.cartogram, cartogramVisibility);
    if (interpolatedVisibility) setVisibility(layerIds.interpolated, interpolatedVisibility);
  };

  const remove = () => {
    basemapController.reset();
    for (const layerId of [layerIds.interpolated, layerIds.cartogram, layerIds.regular]) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }

    for (const sourceId of Object.values(sourceIds)) {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }
  };

  const getState = () => ({
    sourceIds,
    layerIds,
    morphFactor: currentMorphFactor,
  });

  return {
    sourceIds,
    layerIds,
    updateMorphFactor,
    setLayerVisibility,
    applyBasemapEffect: basemapController.apply,
    remove,
    getState,
  };
}
