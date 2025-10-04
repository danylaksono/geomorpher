/**
 * Glyph normalization utilities for Leaflet adapter
 * @module adapters/leaflet/utils/glyphNormalizer
 */

import { isHTMLElement } from "./coordinates.js";

/**
 * Default CSS class for glyph markers
 */
export const DEFAULT_GLYPH_CLASS = "geomorpher-glyph";

/**
 * Default icon size [width, height] in pixels
 */
export const DEFAULT_ICON_SIZE = [48, 48];

/**
 * Default icon anchor [x, y] in pixels
 */
export const DEFAULT_ICON_ANCHOR = [24, 24];

/**
 * Normalize various glyph result formats into a consistent object
 * with a Leaflet icon and options.
 *
 * @param {Object} params
 * @param {*} params.result - Raw result from drawGlyph callback
 * @param {Object} params.L - Leaflet namespace
 * @param {string} [params.pane] - Default pane name
 * @returns {Object|null} - Normalized glyph config or null
 */
export function normalizeGlyphResult({
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
