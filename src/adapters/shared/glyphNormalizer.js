/**
 * Shared glyph normalization logic
 * Converts user-provided drawGlyph results into a consistent intermediate
 * representation that adapters can turn into actual markers.
 */

export const DEFAULT_GLYPH_CLASS = "geomorpher-glyph";
export const DEFAULT_ICON_SIZE = [48, 48];
export const DEFAULT_ICON_ANCHOR = [24, 24];

export const isHTMLElement = (value) =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

export const ensureElement = ({ html, element, className, defaultClass }) => {
  if (isHTMLElement(element)) {
    if (className) element.classList.add(className);
    if (element.style) {
      element.style.pointerEvents = element.style.pointerEvents || "none";
      element.style.position = element.style.position || "absolute";
    }
    return element;
  }

  if (typeof document === "undefined") return null;
  const wrapper = document.createElement("div");
  wrapper.className = className ?? defaultClass ?? DEFAULT_GLYPH_CLASS;
  wrapper.style.position = "absolute";
  wrapper.style.pointerEvents = "none";
  if (typeof html === "string") {
    wrapper.innerHTML = html;
  }
  return wrapper;
};

export const applyIconSizing = (element, iconSize) => {
  if (!iconSize || iconSize.length < 2 || !element?.style) return;
  const [width, height] = iconSize;
  if (Number.isFinite(width)) element.style.width = `${width}px`;
  if (Number.isFinite(height)) element.style.height = `${height}px`;
};

export const computeOffset = ({ iconSize, iconAnchor }) => {
  if (Array.isArray(iconAnchor) && iconAnchor.length >= 2) {
    const [x, y] = iconAnchor;
    if (Number.isFinite(x) && Number.isFinite(y)) return [-x, -y];
  }
  if (Array.isArray(iconSize) && iconSize.length >= 2) {
    const [width, height] = iconSize;
    if (Number.isFinite(width) && Number.isFinite(height)) return [-width / 2, -height / 2];
  }
  return undefined;
};

/**
 * Normalize a raw drawGlyph result into a generic shape. This function does
 * NOT return adapter-specific objects (like Leaflet divIcons) — it provides an
 * intermediate representation used by adapters to create their markers.
 */
export function normalizeRawGlyphResult({ result } = {}) {
  if (result == null) return null;
  if (isHTMLElement(result) || typeof result === "string") {
    return {
      element: isHTMLElement(result) ? result : undefined,
      html: typeof result === "string" ? result : undefined,
      className: undefined,
      iconSize: undefined,
      iconAnchor: undefined,
      markerOptions: undefined,
    };
  }

  if (typeof result === "object") {
    // Check for custom canvas-based glyphs (shape, customRender)
    if (result.shape || result.customRender) {
      return {
        shape: result.shape,
        customRender: result.customRender,
        size: result.size,
        color: result.color,
        fillColor: result.fillColor,
        strokeColor: result.strokeColor,
        strokeWidth: result.strokeWidth,
        rotation: result.rotation,
        label: result.label,
        markerOptions: result.markerOptions ?? {},
      };
    }
    
    if (result.icon || result.element || result.html || result.className) {
      return {
        element: result.element,
        html: result.html,
        className: result.className,
        iconSize: result.iconSize,
        iconAnchor: result.iconAnchor,
        markerOptions: result.markerOptions ?? {},
        icon: result.icon,
      };
    }
  }

  return null;
}
