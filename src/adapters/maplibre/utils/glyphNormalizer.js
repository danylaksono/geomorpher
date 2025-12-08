/**
 * Glyph normalization utilities for MapLibre adapter
 * @module adapters/maplibre/utils/glyphNormalizer
 */

import {
  DEFAULT_GLYPH_CLASS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_ANCHOR,
  applyIconSizing,
  computeOffset,
  ensureElement,
  normalizeRawGlyphResult,
} from "../../shared/glyphNormalizer.js";
import { normalizeForMapLibre } from "../../shared/markerAdapter.js";

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
  const normalized = normalizeRawGlyphResult({ result });
  if (!normalized) return null;

  const resultNormalized = normalizeForMapLibre({ normalized });
  return resultNormalized;
}
