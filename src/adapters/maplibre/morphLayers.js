/**
 * MapLibre morph layer integration.
 *
 * Creates three GeoJSON sources (regular, cartogram, interpolated) and
 * corresponding fill layers that can be morphed by updating the tween source.
 */


const DEFAULT_BASE_ID = "geomorpher";

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
    remove,
    getState,
  };
}
