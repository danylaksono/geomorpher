import {
  DEFAULT_GLYPH_CLASS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_ANCHOR,
  ensureElement,
  applyIconSizing,
  computeOffset,
} from "./glyphNormalizer.js";

export function createLeafletIcon({ L, normalized, pane }) {
  if (!L) throw new Error("Leaflet namespace (L) required");
  if (!normalized) return null;
  if (normalized.icon) return normalized.icon;

  const element = ensureElement({ html: normalized.html, element: normalized.element, className: normalized.className, defaultClass: DEFAULT_GLYPH_CLASS });
  const iconSize = normalized.iconSize ?? DEFAULT_ICON_SIZE;
  const iconAnchor = normalized.iconAnchor ?? DEFAULT_ICON_ANCHOR;
  applyIconSizing(element, iconSize);

  return L.divIcon({
    html: element ? element.outerHTML : (normalized.html ?? ""),
    className: normalized.className ?? DEFAULT_GLYPH_CLASS,
    iconSize,
    iconAnchor,
    pane: normalized.pane ?? pane,
  });
}

export function normalizeForMapLibre({ normalized } = {}) {
  if (!normalized) return null;
  
  // Handle canvas-based custom glyphs (for custom glyph layer)
  if (normalized.shape || normalized.customRender) {
    return {
      shape: normalized.shape,
      customRender: normalized.customRender,
      size: normalized.size,
      color: normalized.color,
      fillColor: normalized.fillColor,
      strokeColor: normalized.strokeColor,
      strokeWidth: normalized.strokeWidth,
      rotation: normalized.rotation,
      label: normalized.label,
      markerOptions: normalized.markerOptions ?? {},
    };
  }
  
  if (normalized.element) {
    const element = ensureElement({ html: normalized.html, element: normalized.element, className: normalized.className, defaultClass: DEFAULT_GLYPH_CLASS }) || normalized.element;
    applyIconSizing(element, normalized.iconSize ?? DEFAULT_ICON_SIZE);
    const offset = computeOffset({ iconSize: normalized.iconSize ?? DEFAULT_ICON_SIZE, iconAnchor: normalized.iconAnchor ?? DEFAULT_ICON_ANCHOR });
    return { element, markerOptions: { anchor: 'top-left', offset, ...(normalized.markerOptions ?? {}) } };
  }
  if (normalized.html) {
    const element = ensureElement({ html: normalized.html, className: normalized.className ?? DEFAULT_GLYPH_CLASS, defaultClass: DEFAULT_GLYPH_CLASS });
    applyIconSizing(element, normalized.iconSize ?? DEFAULT_ICON_SIZE);
    const offset = computeOffset({ iconSize: normalized.iconSize ?? DEFAULT_ICON_SIZE, iconAnchor: normalized.iconAnchor ?? DEFAULT_ICON_ANCHOR });
    return { element, markerOptions: { anchor: 'top-left', offset, ...(normalized.markerOptions ?? {}) } };
  }
  if (normalized.icon) {
    return { element: null, markerOptions: normalized.markerOptions ?? {} };
  }
  return null;
}
