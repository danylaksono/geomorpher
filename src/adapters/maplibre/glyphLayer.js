/**
 * MapLibre glyph layer integration using DOM markers.
 *
 * Provides parity with the Leaflet glyph system while documenting the
 * alternative of using a CustomLayerInterface for high-volume glyph rendering.
 */

import { DEFAULT_GEOMETRY, resolveCollection } from "../leaflet/utils/collections.js";
import { toLngLat, getFeatureBoundsInPixels } from "./utils/coordinates.js";
import { normalizeGlyphResult } from "./utils/glyphNormalizer.js";

const defaultFeatureId = (feature) => feature?.properties?.code ?? feature?.properties?.id;

const fallbackNamespace = typeof globalThis !== "undefined" ? globalThis.maplibregl : undefined;

/**
 * Create a glyph layer backed by MapLibre markers.
 *
 * @param {Object} params
 * @param {Object} params.morpher - Prepared GeoMorpher instance
 * @param {maplibregl.Map} params.map - MapLibre map instance
 * @param {Function} params.drawGlyph - Callback returning DOM-based glyph content
 * @param {number} [params.morphFactor=0] - Initial morph factor
 * @param {string|Function} [params.geometry="interpolated"] - Geometry type or resolver
 * @param {Function} [params.getFeatureId] - Feature identifier resolver
 * @param {Function} [params.getGlyphData] - Custom data resolver for glyph rendering
 * @param {Function} [params.filterFeature] - Filter callback to skip glyph creation
 * @param {Object} [params.markerOptions={}] - Default Marker options
 * @param {boolean} [params.scaleWithZoom=false] - Re-render glyphs on zoom changes
 * @param {Object} [params.maplibreNamespace=maplibregl] - Optional MapLibre namespace override
 * @returns {Promise<Object>} Glyph layer controller
 */
export async function createMapLibreGlyphLayer({
  morpher,
  map,
  drawGlyph,
  morphFactor = 0,
  geometry = DEFAULT_GEOMETRY,
  getFeatureId = defaultFeatureId,
  getGlyphData,
  filterFeature,
  markerOptions = {},
  scaleWithZoom = false,
  maplibreNamespace = fallbackNamespace,
} = {}) {
  if (!morpher || !map) {
    throw new Error("Both morpher and MapLibre map are required");
  }

  if (!maplibreNamespace?.Marker) {
    throw new Error("MapLibre namespace is required. Pass the result of `import('maplibre-gl')` or ensure maplibregl is available on globalThis.");
  }

  if (typeof drawGlyph !== "function") {
    throw new Error("drawGlyph must be a function that returns glyph rendering options");
  }

  if (!morpher.isPrepared()) {
    await morpher.prepare();
  }

  let currentGeometry = geometry ?? DEFAULT_GEOMETRY;
  let currentMorphFactor = morphFactor ?? 0;

  const baseDataLookup = morpher.getKeyData();
  const markers = new Map();

  const resolveData = ({ featureId, feature }) => {
    if (typeof getGlyphData === "function") {
      return getGlyphData({
        feature,
        featureId,
        morpher,
        geometry: currentGeometry,
        morphFactor: currentMorphFactor,
      });
    }
    return baseDataLookup?.[featureId] ?? null;
  };

  const shouldRenderFeature =
    typeof filterFeature === "function"
      ? (context) => Boolean(filterFeature(context))
      : () => true;

  const upsertMarker = ({ featureId, glyph, lngLat }) => {
    let entry = markers.get(featureId);
    const combinedOptions = {
      draggable: false,
      ...markerOptions,
      ...(glyph.markerOptions ?? {}),
    };

    const { element: _ignored, ...markerOptionOverrides } = combinedOptions;

    if (!entry) {
      const marker = new maplibreNamespace.Marker({
        element: glyph.element,
        ...markerOptionOverrides,
      })
        .setLngLat(lngLat)
        .addTo(map);

      markers.set(featureId, { marker, element: glyph.element });
      return;
    }

    const { marker } = entry;
    marker.setLngLat(lngLat);
    if (glyph.element && glyph.element !== entry.element) {
      marker.setElement(glyph.element);
      entry.element = glyph.element;
    }

    if (Array.isArray(markerOptionOverrides.offset)) {
      marker.setOffset(markerOptionOverrides.offset);
    }
    if (typeof markerOptionOverrides.rotation === "number") {
      marker.setRotation(markerOptionOverrides.rotation);
    }
    if (typeof markerOptionOverrides.pitchAlignment === "string") {
      marker.setPitchAlignment(markerOptionOverrides.pitchAlignment);
    }
    if (typeof markerOptionOverrides.rotationAlignment === "string") {
      marker.setRotationAlignment(markerOptionOverrides.rotationAlignment);
    }
  };

  const removeMarker = (featureId) => {
    const entry = markers.get(featureId);
    if (!entry) return;
    markers.delete(featureId);
    entry.marker.remove();
  };

  const updateGlyphs = ({ geometry: nextGeometry, morphFactor: nextMorph } = {}) => {
    if (typeof nextGeometry !== "undefined") {
      currentGeometry = nextGeometry;
    }
    if (typeof nextMorph === "number") {
      currentMorphFactor = nextMorph;
    }

    const collection = resolveCollection({
      morpher,
      geometry: currentGeometry,
      morphFactor: currentMorphFactor,
    });

    if (!collection?.features) {
      markers.forEach((_, id) => removeMarker(id));
      return { geometry: currentGeometry, morphFactor: currentMorphFactor, featureCount: 0 };
    }

    const nextIds = new Set();

    for (const feature of collection.features) {
      if (!feature) continue;
      const featureId = getFeatureId(feature);
      if (featureId == null) continue;

      const lngLat = toLngLat(feature);
      if (!lngLat) {
        removeMarker(featureId);
        continue;
      }

      const data = resolveData({ featureId, feature });
      const featureBounds = scaleWithZoom
        ? getFeatureBoundsInPixels(feature, map, maplibreNamespace)
        : null;

      const context = {
        feature,
        featureId,
        geometry: currentGeometry,
        morphFactor: currentMorphFactor,
        data,
        morpher,
        map,
        zoom: map.getZoom(),
        featureBounds,
      };

      if (!shouldRenderFeature(context)) {
        removeMarker(featureId);
        continue;
      }

      const glyphResult = drawGlyph(context);
      const glyph = normalizeGlyphResult({ result: glyphResult });

      if (!glyph || !glyph.element) {
        removeMarker(featureId);
        continue;
      }

      upsertMarker({ featureId, glyph, lngLat });
      nextIds.add(featureId);
    }

    markers.forEach((_, id) => {
      if (!nextIds.has(id)) {
        removeMarker(id);
      }
    });

    return {
      geometry: currentGeometry,
      morphFactor: currentMorphFactor,
      featureCount: nextIds.size,
    };
  };

  const clear = () => {
    markers.forEach((_, id) => removeMarker(id));
  };

  const getState = () => ({
    geometry: currentGeometry,
    morphFactor: currentMorphFactor,
    markerCount: markers.size,
    scaleWithZoom,
  });

  const destroy = () => {
    clear();
    if (scaleWithZoom && map) {
      map.off("zoomend", handleZoomEnd);
    }
  };

  const handleZoomEnd = () => {
    updateGlyphs({});
  };

  if (scaleWithZoom && map) {
    map.on("zoomend", handleZoomEnd);
  }

  updateGlyphs({});

  return {
    updateGlyphs,
    clear,
    getState,
    destroy,
  };
}

/**
 * For performance-critical glyph rendering, consider implementing a
 * MapLibre `CustomLayerInterface` that batches glyph drawing on the GPU.
 * See https://www.maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/
 * for details.
 */
