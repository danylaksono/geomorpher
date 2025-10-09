/**
 * Leaflet glyph layer for rendering custom markers on morphed geometries
 * @module adapters/leaflet/glyphLayer
 */

import { toLatLng } from "./utils/coordinates.js";
import { normalizeGlyphResult } from "./utils/glyphNormalizer.js";
import { DEFAULT_GEOMETRY, resolveCollection } from "./utils/collections.js";

/**
 * Calculate the pixel dimensions of a feature's bounds at the current map zoom
 *
 * @param {Object} feature - GeoJSON feature
 * @param {Object} map - Leaflet map instance
 * @param {Object} L - Leaflet namespace
 * @returns {Object|null} - Bounds with width, height, center in pixels
 */
function getFeatureBoundsInPixels(feature, map, L) {
  if (!feature || !map || !L) return null;

  try {
    const geoJsonLayer = L.geoJSON(feature);
    const bounds = geoJsonLayer.getBounds();

    if (!bounds.isValid()) return null;

    const ne = map.latLngToContainerPoint(bounds.getNorthEast());
    const sw = map.latLngToContainerPoint(bounds.getSouthWest());

    return {
      width: Math.abs(ne.x - sw.x),
      height: Math.abs(ne.y - sw.y),
      center: map.latLngToContainerPoint(bounds.getCenter()),
      bounds: bounds,
    };
  } catch (error) {
    console.warn("Failed to calculate feature bounds:", error);
    return null;
  }
}

/**
 * Create a Leaflet layer for rendering custom glyphs (markers) that follow
 * the morphing geometry.
 *
 * @param {Object} params
 * @param {Object} params.morpher - Prepared GeoMorpher instance
 * @param {Object} params.L - Leaflet namespace
 * @param {Object} [params.map] - Leaflet map instance to add layer to
 * @param {string|Function} [params.geometry="interpolated"] - Geometry type or custom function
 * @param {number} [params.morphFactor=0] - Initial morph factor
 * @param {Function} params.drawGlyph - Function to render each glyph
 * @param {Function} [params.getFeatureId] - Function to extract feature ID
 * @param {Function} [params.getGlyphData] - Function to resolve glyph data
 * @param {Function} [params.filterFeature] - Function to filter features
 * @param {Object} [params.markerOptions={}] - Default Leaflet marker options
 * @param {string} [params.pane] - Leaflet pane name for markers
 * @param {boolean} [params.scaleWithZoom=false] - If true, glyphs resize based on feature bounds at each zoom level
 * @returns {Promise<Object>} - Glyph layer controller
 */
export async function createLeafletGlyphLayer({
  morpher,
  L,
  map,
  geometry = DEFAULT_GEOMETRY,
  morphFactor = 0,
  drawGlyph,
  getFeatureId = (feature) => feature?.properties?.code ?? feature?.properties?.id,
  getGlyphData,
  filterFeature,
  markerOptions = {},
  pane,
  scaleWithZoom = false,
}) {
  if (!morpher || !L) {
    throw new Error("Both morpher and Leaflet namespace (L) are required");
  }

  if (typeof drawGlyph !== "function") {
    throw new Error("drawGlyph must be a function that returns glyph rendering options");
  }

  if (!morpher.isPrepared()) {
    await morpher.prepare();
  }

  let currentGeometry = geometry ?? DEFAULT_GEOMETRY;
  let currentMorphFactor = morphFactor ?? 0;

  const glyphLayer = L.layerGroup ? L.layerGroup([]) : null;
  if (!glyphLayer) {
    throw new Error("Leaflet namespace is missing layerGroup factory");
  }

  if (map && typeof glyphLayer.addTo === "function") {
    glyphLayer.addTo(map);
  }

  const markers = new Map();
  const baseDataLookup = morpher.getKeyData();

  const resolveData = ({ feature, featureId, geometryType, morphValue }) => {
    if (typeof getGlyphData === "function") {
      return getGlyphData({ feature, featureId, morpher, geometry: geometryType, morphFactor: morphValue });
    }
    return baseDataLookup?.[featureId] ?? null;
  };

  const shouldRenderFeature =
    typeof filterFeature === "function"
      ? (context) => Boolean(filterFeature(context))
      : () => true;

  let zoomEndListener = null;

  if (map && scaleWithZoom) {
    zoomEndListener = () => {
      updateGlyphs({});
    };
    map.on("zoomend", zoomEndListener);
  }

  const upsertMarker = ({ feature, glyph, featureId }) => {
    const latLng = toLatLng(feature);
    if (!latLng) return;

    const { icon, pane: glyphPane, markerOptions: glyphMarkerOptions = {} } = glyph;
    if (!icon) return;

    const combinedOptions = {
      interactive: false,
      ...markerOptions,
      ...glyphMarkerOptions,
    };

    if (glyphPane || pane) {
      combinedOptions.pane = glyphPane ?? pane;
    }

    let marker = markers.get(featureId);
    if (marker) {
      if (typeof marker.setLatLng === "function") {
        marker.setLatLng(latLng);
      }
      if (typeof marker.setIcon === "function") {
        marker.setIcon(icon);
      }
      return;
    }

    marker = L.marker(latLng, { ...combinedOptions, icon });

    if (typeof glyphLayer.addLayer === "function") {
      glyphLayer.addLayer(marker);
    } else if (typeof marker.addTo === "function") {
      marker.addTo(glyphLayer);
    }

    markers.set(featureId, marker);
  };

  const removeMarker = (featureId) => {
    const marker = markers.get(featureId);
    if (!marker) return;
    markers.delete(featureId);
    if (typeof glyphLayer.removeLayer === "function") {
      glyphLayer.removeLayer(marker);
    } else if (typeof marker.remove === "function") {
      marker.remove();
    }
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

      const data = resolveData({
        feature,
        featureId,
        geometryType: currentGeometry,
        morphValue: currentMorphFactor,
      });

      const featureBounds = scaleWithZoom && map
        ? getFeatureBoundsInPixels(feature, map, L)
        : null;

      const context = {
        feature,
        featureId,
        geometry: currentGeometry,
        morphFactor: currentMorphFactor,
        data,
        morpher,
        zoom: map ? map.getZoom() : null,
        featureBounds,
      };

      if (!shouldRenderFeature(context)) {
        removeMarker(featureId);
        continue;
      }

      const glyphResult = drawGlyph(context);

      const glyph = normalizeGlyphResult({ result: glyphResult, L, pane });

      if (!glyph) {
        removeMarker(featureId);
        continue;
      }

      upsertMarker({ feature, glyph, featureId });
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
    if (typeof glyphLayer.clearLayers === "function") {
      glyphLayer.clearLayers();
    }
  };

  const getState = () => ({
    geometry: currentGeometry,
    morphFactor: currentMorphFactor,
    markerCount: markers.size,
    scaleWithZoom,
  });

  const destroy = () => {
    clear();
    if (map && zoomEndListener) {
      map.off("zoomend", zoomEndListener);
    }
  };

  updateGlyphs({});

  return {
    layer: glyphLayer,
    updateGlyphs,
    clear,
    getState,
    destroy,
  };
}
