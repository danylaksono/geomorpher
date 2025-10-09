/**
 * Leaflet morph layers with basemap effects
 * @module adapters/leaflet/morphLayers
 */

/**
 * Create Leaflet layers for morphing between regular and cartogram geometries,
 * with optional basemap blur/opacity effects.
 *
 * @param {Object} params
 * @param {Object} params.morpher - Prepared GeoMorpher instance
 * @param {Object} params.L - Leaflet namespace
 * @param {number} [params.morphFactor=0] - Initial morph factor (0=regular, 1=cartogram)
 * @param {Function} [params.regularStyle] - Style function for regular layer
 * @param {Function} [params.cartogramStyle] - Style function for cartogram layer
 * @param {Function} [params.tweenStyle] - Style function for tween/interpolated layer
 * @param {Function} [params.onEachFeature] - Callback for each feature
 * @param {Object} [params.basemapLayer] - Leaflet layer to apply effects to
 * @param {Object} [params.basemapEffect] - Effect configuration
 * @returns {Promise<Object>} - Layer group and update function
 */
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
