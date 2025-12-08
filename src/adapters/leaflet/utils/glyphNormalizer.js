/**
 * Glyph normalization utilities for Leaflet adapter
 * @module adapters/leaflet/utils/glyphNormalizer
 */

import {
  DEFAULT_GLYPH_CLASS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_ANCHOR,
  normalizeRawGlyphResult,
} from "../../shared/glyphNormalizer.js";
import { createLeafletIcon } from "../../shared/markerAdapter.js";

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
export function normalizeGlyphResult({ result, L, pane }) {
  if (result == null) {
    return null;
  }
  const normalized = normalizeRawGlyphResult({ result });
  if (!normalized) return null;

  // If the user already provided a Leaflet icon, pass it through via the helper.
  const icon = createLeafletIcon({ L, normalized, pane });
  if (!icon) return null;
  return {
    icon,
    pane: normalized.pane ?? pane,
    markerOptions: normalized.markerOptions ?? {},
  };
}
