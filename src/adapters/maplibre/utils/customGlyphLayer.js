/**
 * MapLibre custom layer for high-performance canvas-based glyph rendering.
 *
 * Renders glyphs onto a canvas overlay positioned on the map, enabling efficient
 * rendering of large glyph datasets (100s-1000s of glyphs) with superior performance
 * compared to DOM marker-based approaches.
 *
 * @module adapters/maplibre/utils/customGlyphLayer
 */

import { DEFAULT_GEOMETRY, resolveCollection } from "../../shared/collections.js";
import { toLngLat } from "./coordinates.js";
import { normalizeGlyphResult } from "./glyphNormalizer.js";

const defaultFeatureId = (feature) => feature?.properties?.code ?? feature?.properties?.id;

/**
 * Create a high-performance glyph layer using a canvas overlay.
 *
 * Unlike the DOM-based marker approach, this renders glyphs onto a canvas layer,
 * enabling efficient rendering of large glyph datasets with better animation performance.
 *
 * @param {Object} params
 * @param {Object} params.morpher - Prepared GeoMorpher instance
 * @param {maplibregl.Map} params.map - MapLibre map instance
 * @param {Function} params.drawGlyph - Callback returning glyph rendering data
 * @param {number} [params.morphFactor=0] - Initial morph factor
 * @param {string|Function} [params.geometry="interpolated"] - Geometry type or resolver
 * @param {Function} [params.getFeatureId] - Feature identifier resolver
 * @param {Function} [params.getGlyphData] - Custom data resolver for glyph rendering
 * @param {Function} [params.filterFeature] - Filter callback to skip glyph creation
 * @param {Object} [params.glyphOptions={}] - Default glyph rendering options
 * @param {Object} [params.maplibreNamespace=maplibregl] - Optional MapLibre namespace override
 * @returns {Promise<Object>} Glyph layer controller
 */
export async function createMapLibreCustomGlyphLayer({
  morpher,
  map,
  drawGlyph,
  morphFactor = 0,
  geometry = DEFAULT_GEOMETRY,
  getFeatureId = defaultFeatureId,
  getGlyphData,
  filterFeature,
  glyphOptions = {},
  maplibreNamespace = typeof globalThis !== "undefined" ? globalThis.maplibregl : undefined,
  featureProvider,
  featureCollection,
} = {}) {
  if (!map) {
    throw new Error("MapLibre map instance (map) is required");
  }

  if (!morpher && typeof featureProvider !== "function" && !featureCollection) {
    throw new Error("Either morpher or featureProvider/featureCollection must be supplied");
  }

  if (typeof drawGlyph !== "function") {
    throw new Error("drawGlyph must be a function that returns glyph rendering options");
  }

  if (morpher && !morpher.isPrepared()) {
    await morpher.prepare();
  }

  let currentGeometry = geometry ?? DEFAULT_GEOMETRY;
  let currentMorphFactor = morphFactor ?? 0;

  const baseDataLookup = morpher ? morpher.getKeyData() : {};
  const glyphs = new Map(); // Map of featureId -> glyph data

  // Create canvas overlay
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "100";

  const container = map.getContainer?.() || map.canvasContainer?.();
  if (!container) {
    throw new Error("Cannot find map container element");
  }
  container.appendChild(canvas);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to get canvas 2D context");
  }

  // Set initial canvas size
  const resizeCanvas = () => {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    // Reset canvas context state and scale for HiDPI displays
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
  };

  resizeCanvas();

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

  const getCollection = ({ geometry: g = currentGeometry, morphFactor: m = currentMorphFactor } = {}) => {
    if (typeof featureProvider === "function") {
      return featureProvider({ geometry: g, morphFactor: m });
    }
    if (featureCollection) return featureCollection;
    if (morpher) return resolveCollection({ morpher, geometry: g, morphFactor: m });
    return null;
  };

  const updateGlyphs = ({ geometry: nextGeometry, morphFactor: nextMorph } = {}) => {
    if (typeof nextGeometry !== "undefined") {
      currentGeometry = nextGeometry;
    }
    if (typeof nextMorph === "number") {
      currentMorphFactor = nextMorph;
    }

    const collection = getCollection({ geometry: currentGeometry, morphFactor: currentMorphFactor });

    if (!collection?.features) {
      glyphs.clear();
      render();
      return { geometry: currentGeometry, morphFactor: currentMorphFactor, glyphCount: 0 };
    }

    const nextIds = new Set();

    for (const feature of collection.features) {
      if (!feature) continue;

      const featureId = getFeatureId(feature);
      if (featureId == null) continue;

      const lngLat = toLngLat(feature);
      if (!lngLat) {
        glyphs.delete(featureId);
        continue;
      }

      const data = resolveData({ featureId, feature });

      const glyphContext = {
        feature,
        featureId,
        geometry: currentGeometry,
        morphFactor: currentMorphFactor,
        data,
        morpher,
        map,
        zoom: map.getZoom(),
      };

      if (!shouldRenderFeature(glyphContext)) {
        glyphs.delete(featureId);
        continue;
      }

      const glyphResult = drawGlyph(glyphContext);
      const glyph = normalizeGlyphResult({ result: glyphResult });

      if (!glyph) {
        glyphs.delete(featureId);
        continue;
      }

      // Store glyph data for rendering
      glyphs.set(featureId, {
        lngLat,
        feature,
        featureId,
        glyph,
      });

      nextIds.add(featureId);
    }

    // Remove glyphs that are no longer in the collection
    glyphs.forEach((_, id) => {
      if (!nextIds.has(id)) {
        glyphs.delete(id);
      }
    });

    render();

    return {
      geometry: currentGeometry,
      morphFactor: currentMorphFactor,
      glyphCount: nextIds.size,
    };
  };

  const render = () => {
    // Clear canvas with transparent background
    context.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

    // Render each glyph
    glyphs.forEach(({ lngLat, glyph, featureId }) => {
      // Project geographic coordinates to pixel coordinates
      const pixelPos = map.project(lngLat);

      renderGlyph({
        context,
        pixelPos,
        glyph,
        glyphOptions,
      });
    });
  };

  const clear = () => {
    glyphs.clear();
    render();
  };

  const getState = () => ({
    geometry: currentGeometry,
    morphFactor: currentMorphFactor,
    glyphCount: glyphs.size,
  });

  const destroy = () => {
    clear();
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    map.off("move", handleMapEvent);
    map.off("zoom", handleMapEvent);
    map.off("render", handleMapEvent);
    window.removeEventListener("resize", handleResize);
  };

  // Handle map events for re-rendering
  const handleMapEvent = () => {
    render();
  };

  const handleResize = () => {
    resizeCanvas();
    render();
  };

  map.on("move", handleMapEvent);
  map.on("zoom", handleMapEvent);
  map.on("render", handleMapEvent);
  window.addEventListener("resize", handleResize);

  // Initial glyph update
  updateGlyphs({});

  return {
    updateGlyphs,
    clear,
    getState,
    destroy,
  };
}

/**
 * Render a single glyph on the canvas.
 *
 * @param {Object} params
 * @param {CanvasRenderingContext2D} params.context - Canvas 2D context
 * @param {Object} params.pixelPos - { x, y } pixel position
 * @param {Object} params.glyph - Normalized glyph object
 * @param {Object} params.feature - GeoJSON feature
 * @param {String|Number} params.featureId - Feature identifier
 * @param {Object} params.glyphOptions - Glyph rendering options
 */
function renderGlyph({ context, pixelPos, glyph, feature, featureId, glyphOptions }) {
  if (!glyph) return;

  const { x, y } = pixelPos;

  // Determine glyph size
  const size = glyph.size ?? glyphOptions.size ?? 24;
  const radius = size / 2;

  // Determine glyph color
  const color = glyph.color ?? glyphOptions.color ?? "#4285F4";
  const fillColor = glyph.fillColor ?? glyphOptions.fillColor ?? color;
  const strokeColor = glyph.strokeColor ?? glyphOptions.strokeColor ?? "rgba(0, 0, 0, 0.5)";
  const strokeWidth = glyph.strokeWidth ?? glyphOptions.strokeWidth ?? 1;

  // Determine glyph shape type
  const shapeType = glyph.shape ?? glyphOptions.shape ?? "circle";

  context.save();
  context.translate(x, y);

  // Apply rotation if specified
  if (typeof glyph.rotation === "number") {
    context.rotate((glyph.rotation * Math.PI) / 180);
  }

  // Draw the glyph shape
  switch (shapeType) {
    case "circle":
      drawCircle(context, 0, 0, radius, fillColor, strokeColor, strokeWidth);
      break;
    case "square":
      drawSquare(context, 0, 0, size, fillColor, strokeColor, strokeWidth);
      break;
    case "triangle":
      drawTriangle(context, 0, 0, radius, fillColor, strokeColor, strokeWidth);
      break;
    case "star":
      drawStar(context, 0, 0, radius, fillColor, strokeColor, strokeWidth);
      break;
    case "custom":
      // Allow custom rendering via callback
      if (typeof glyph.customRender === "function") {
        glyph.customRender(context, 0, 0, size);
      }
      break;
    default:
      drawCircle(context, 0, 0, radius, fillColor, strokeColor, strokeWidth);
  }

  // Optionally render label/text
  if (glyph.label) {
    drawLabel(context, glyph.label, 0, radius + 10, glyphOptions);
  }

  context.restore();
}

/**
 * Draw a circle on the canvas
 */
function drawCircle(context, x, y, radius, fillColor, strokeColor, strokeWidth) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fillColor;
  context.fill();

  if (strokeWidth > 0) {
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}

/**
 * Draw a square on the canvas
 */
function drawSquare(context, x, y, size, fillColor, strokeColor, strokeWidth) {
  const half = size / 2;
  context.fillStyle = fillColor;
  context.fillRect(x - half, y - half, size, size);

  if (strokeWidth > 0) {
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    context.strokeRect(x - half, y - half, size, size);
  }
}

/**
 * Draw a triangle on the canvas
 */
function drawTriangle(context, x, y, radius, fillColor, strokeColor, strokeWidth) {
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y + radius);
  context.lineTo(x - radius, y + radius);
  context.closePath();

  context.fillStyle = fillColor;
  context.fill();

  if (strokeWidth > 0) {
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}

/**
 * Draw a star on the canvas
 */
function drawStar(context, x, y, radius, fillColor, strokeColor, strokeWidth) {
  const spikes = 5;
  const outerRadius = radius;
  const innerRadius = radius * 0.4;

  let angle = Math.PI / 2;
  const angleSlice = Math.PI / spikes;

  context.beginPath();

  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const px = x + Math.cos(angle) * r;
    const py = y - Math.sin(angle) * r;

    if (i === 0) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }

    angle += angleSlice;
  }

  context.closePath();

  context.fillStyle = fillColor;
  context.fill();

  if (strokeWidth > 0) {
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}

/**
 * Draw a text label on the canvas
 */
function drawLabel(context, label, x, y, options = {}) {
  context.fillStyle = options.labelColor ?? "#333";
  context.font = options.labelFont ?? "12px Arial";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(String(label), x, y);
}
