export async function createLeafletMorphLayers({
  morpher,
  L,
  morphFactor = 0,
  regularStyle,
  cartogramStyle,
  tweenStyle,
  onEachFeature,
  basemapLayer,
  basemapEffect,
}) {
  if (!morpher || !L) {
    throw new Error("Both morpher and Leaflet namespace (L) are required");
  }

  const layerOptions = (styleFn) => ({
    style: styleFn,
    onEachFeature,
  });

  if (!morpher.isPrepared()) {
    await morpher.prepare();
  }

  const regularLayer = L.geoJSON(
    morpher.getRegularFeatureCollection(),
    layerOptions(regularStyle)
  );

  const cartogramLayer = L.geoJSON(
    morpher.getCartogramFeatureCollection(),
    layerOptions(cartogramStyle)
  );

  const tweenLayer = L.geoJSON(
    morpher.getInterpolatedFeatureCollection(morphFactor),
    layerOptions(tweenStyle)
  );

  const group = L.layerGroup([regularLayer, tweenLayer, cartogramLayer]);

  const normalizeRange = (range, fallback) => {
    if (range == null) return fallback;
    if (Array.isArray(range) && range.length === 2) {
      return range;
    }
    if (typeof range === "object") {
      const { from, to } = range;
      if (typeof from === "number" && typeof to === "number") {
        return [from, to];
      }
    }
    if (typeof range === "number") {
      const [start = 0] = fallback ?? [];
      return [start, range];
    }
    return fallback;
  };

  const lerp = (start, end, amount) => start + (end - start) * amount;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const resolveTarget = (target) => {
    if (!target) return null;
    if (typeof target === "function") {
      try {
        const next = target();
        return resolveTarget(next);
      } catch (error) {
        console.error("geo-morpher:createLeafletMorphLayers", error);
        return null;
      }
    }
    if (target.getContainer && typeof target.getContainer === "function") {
      return target.getContainer();
    }
    if (target._container) {
      return target._container;
    }
    if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
      return target;
    }
    if (target.getPane && basemapEffect?.pane) {
      return target.getPane(basemapEffect.pane);
    }
    return null;
  };

  const effectOptions = (() => {
    if (!basemapLayer && !basemapEffect) {
      return null;
    }

    const options =
      basemapEffect && typeof basemapEffect === "object" ? basemapEffect : {};

    const target = options.target ?? options.layer ?? basemapLayer;
    const blurRange = normalizeRange(options.blurRange, [0, 8]);
    const opacityRange = normalizeRange(options.opacityRange, [1, 0.2]);
    const grayscaleRange = normalizeRange(options.grayscaleRange, null);
    const brightnessRange = normalizeRange(options.brightnessRange, null);
    const isEnabled =
      typeof options.isEnabled === "function"
        ? options.isEnabled
        : () => true;

    let originalStyles;
    let captured = false;

    const getElement = () => resolveTarget(target);

    return {
      getElement,
      getOriginalStyles(element) {
        if (!captured && element) {
          originalStyles = {
            filter: element.style.filter,
            opacity: element.style.opacity,
          };
          captured = true;
        }
        return originalStyles;
      },
      blurRange,
      opacityRange,
      grayscaleRange,
      brightnessRange,
      isEnabled,
    };
  })();

  const applyBasemapEffect = (factor) => {
    if (!effectOptions) return;
    const element = effectOptions.getElement();
    if (!element || !element.style) return;

    const original = effectOptions.getOriginalStyles(element) ?? {
      filter: "",
      opacity: "",
    };

    if (!effectOptions.isEnabled?.()) {
      element.style.filter = original.filter ?? "";
      element.style.opacity = original.opacity ?? "";
      return;
    }

    const filters = [];

    if (effectOptions.blurRange) {
      const [start, end] = effectOptions.blurRange;
      const blurAmount = lerp(start, end, factor);
      if (Math.abs(blurAmount) > 0.01) {
        filters.push(`blur(${blurAmount.toFixed(2)}px)`);
      }
    }

    if (effectOptions.grayscaleRange) {
      const [start, end] = effectOptions.grayscaleRange;
      const grayscale = clamp(lerp(start, end, factor), 0, 1);
      if (Math.abs(grayscale - 1) > 0.01 || Math.abs(grayscale) > 0.01) {
        filters.push(`grayscale(${grayscale.toFixed(2)})`);
      }
    }

    if (effectOptions.brightnessRange) {
      const [start, end] = effectOptions.brightnessRange;
      const brightness = clamp(lerp(start, end, factor), 0, 10);
      if (Math.abs(brightness - 1) > 0.01) {
        filters.push(`brightness(${brightness.toFixed(2)})`);
      }
    }

    if (filters.length > 0) {
      element.style.filter = filters.join(" ");
    } else {
      element.style.filter = original.filter ?? "";
    }

    if (effectOptions.opacityRange) {
      const [start, end] = effectOptions.opacityRange;
      const nextOpacity = clamp(lerp(start, end, factor), 0, 1);
      const shouldClear = Math.abs(nextOpacity - 1) < 0.01 && original.opacity === "";
      if (shouldClear) {
        element.style.opacity = "";
      } else {
        element.style.opacity = nextOpacity.toFixed(3);
      }
    }
  };

  const updateMorphFactor = (nextFactor) => {
    const collection = morpher.getInterpolatedFeatureCollection(nextFactor);
    tweenLayer.clearLayers();
    tweenLayer.addData(collection);
    applyBasemapEffect(nextFactor);
    return collection;
  };

  applyBasemapEffect(morphFactor);

  return {
    group,
    regularLayer,
    cartogramLayer,
    tweenLayer,
    updateMorphFactor,
  };
}

const DEFAULT_GLYPH_CLASS = "geomorpher-glyph";

const DEFAULT_ICON_SIZE = [48, 48];

const DEFAULT_ICON_ANCHOR = [24, 24];

const DEFAULT_GEOMETRY = "interpolated";

function toLatLng(feature) {
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

const isHTMLElement = (value) =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

function normalizeGlyphResult({
  result,
  L,
  pane,
}) {
  if (result == null) {
    return null;
  }

  if (isHTMLElement(result) || typeof result === "string") {
    const html = isHTMLElement(result) ? result.outerHTML : result;
    return {
      icon: L.divIcon({
        html,
        className: DEFAULT_GLYPH_CLASS,
        iconSize: DEFAULT_ICON_SIZE,
        iconAnchor: DEFAULT_ICON_ANCHOR,
        pane,
      }),
      pane,
    };
  }

  if (typeof result === "object") {
    if (result.icon) {
      return {
        icon: result.icon,
        pane: result.pane ?? pane,
        markerOptions: result.markerOptions ?? {},
      };
    }

    const {
      html = "",
      className = DEFAULT_GLYPH_CLASS,
      iconSize,
      iconAnchor,
      pane: resultPane,
      markerOptions = {},
      divIconOptions = {},
    } = result;

    const htmlContent = isHTMLElement(html) ? html.outerHTML : html;

    const icon = L.divIcon({
      html: htmlContent,
      className,
      iconSize: iconSize ?? DEFAULT_ICON_SIZE,
      iconAnchor: iconAnchor ?? DEFAULT_ICON_ANCHOR,
      pane: resultPane ?? pane,
      ...divIconOptions,
    });

    return {
      icon,
      pane: resultPane ?? pane,
      markerOptions,
    };
  }

  return null;
}

const collectionRetrievers = {
  regular: (morpher) => morpher.getRegularFeatureCollection(),
  cartogram: (morpher) => morpher.getCartogramFeatureCollection(),
  interpolated: (morpher, factor) => morpher.getInterpolatedFeatureCollection(factor),
};

function resolveCollection({ morpher, geometry, morphFactor }) {
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

      const context = {
        feature,
        featureId,
        geometry: currentGeometry,
        morphFactor: currentMorphFactor,
        data,
        morpher,
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
  });

  updateGlyphs({});

  return {
    layer: glyphLayer,
    updateGlyphs,
    clear,
    getState,
  };
}
