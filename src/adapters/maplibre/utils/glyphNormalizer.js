/**
 * Glyph normalization utilities for MapLibre adapter
 * @module adapters/maplibre/utils/glyphNormalizer
 */

import { isHTMLElement } from "./coordinates.js";

export const DEFAULT_GLYPH_CLASS = "geomorpher-glyph";
export const DEFAULT_ICON_SIZE = [48, 48];
export const DEFAULT_ICON_ANCHOR = [24, 24];

const ensureElement = ({ html, element, className }) => {
  if (isHTMLElement(element)) {
    if (className) {
      element.classList.add(className);
    }
    if (element.style) {
      element.style.pointerEvents = element.style.pointerEvents || "none";
      element.style.position = element.style.position || "absolute";
    }
    return element;
  }

  if (typeof document === "undefined") {
    throw new Error("MapLibre glyph normalization requires a DOM environment");
  }

  const wrapper = document.createElement("div");
  wrapper.className = className ?? DEFAULT_GLYPH_CLASS;
  wrapper.style.position = "absolute";
  wrapper.style.pointerEvents = "none";
  if (typeof html === "string") {
    wrapper.innerHTML = html;
  }

  return wrapper;
};

const applyIconSizing = (element, iconSize) => {
  if (!iconSize || iconSize.length < 2 || !element?.style) return;
  const [width, height] = iconSize;
  if (Number.isFinite(width)) {
    element.style.width = `${width}px`;
  }
  if (Number.isFinite(height)) {
    element.style.height = `${height}px`;
  }
};

const computeOffset = ({ iconSize, iconAnchor }) => {
  if (Array.isArray(iconAnchor) && iconAnchor.length >= 2) {
    const [x, y] = iconAnchor;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return [-x, -y];
    }
  }

  if (Array.isArray(iconSize) && iconSize.length >= 2) {
    const [width, height] = iconSize;
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return [-width / 2, -height / 2];
    }
  }

  return undefined;
};

/**
 * Normalize drawGlyph results into MapLibre marker configuration.
 *
 * @param {Object} params
 * @param {*} params.result - Raw result from drawGlyph callback
 * @returns {Object|null} - Normalized glyph configuration or null
 */
export function normalizeGlyphResult({ result }) {
  if (result == null) {
    return null;
  }

  if (isHTMLElement(result) || typeof result === "string") {
    const element = ensureElement({ html: result, element: result });
    applyIconSizing(element, DEFAULT_ICON_SIZE);
    const offset = computeOffset({ iconSize: DEFAULT_ICON_SIZE });
    return {
      element,
      markerOptions: {
        offset,
      },
    };
  }

  if (typeof result === "object") {
    if (result.element || isHTMLElement(result)) {
      const element = ensureElement({
        element: result.element ?? result,
        className: result.className,
        html: result.html,
      });
      applyIconSizing(element, result.iconSize ?? DEFAULT_ICON_SIZE);
      const offset = computeOffset({
        iconSize: result.iconSize,
        iconAnchor: result.iconAnchor,
      });

      return {
        element,
        markerOptions: {
          offset,
          ...(result.markerOptions ?? {}),
        },
      };
    }

    if (result.html || result.className) {
      const element = ensureElement({
        html: result.html,
        className: result.className ?? DEFAULT_GLYPH_CLASS,
      });
      applyIconSizing(element, result.iconSize ?? DEFAULT_ICON_SIZE);
      const offset = computeOffset({
        iconSize: result.iconSize,
        iconAnchor: result.iconAnchor,
      });

      return {
        element,
        markerOptions: {
          offset,
          ...(result.markerOptions ?? {}),
        },
      };
    }
  }

  return null;
}
