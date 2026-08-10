import type { GeoJsonProperties, MorphFeature, Position } from "./common.js";

/** DOM-backed glyph, rendered as a marker overlay. */
export interface DomGlyphSpec {
  /** Pre-built element. Takes precedence over `html`. */
  element?: HTMLElement;
  html?: string;
  className?: string;
  /** `[width, height]` in pixels. @default [48, 48] */
  iconSize?: [number, number];
  /** `[x, y]` offset of the anchor within the icon. @default [24, 24] */
  iconAnchor?: [number, number];
  /** Passed through to the underlying Leaflet/MapLibre marker. */
  markerOptions?: Record<string, unknown>;
  /** An adapter-native icon, used as-is when supplied. */
  icon?: unknown;
}

/** Canvas-backed glyph, drawn by the MapLibre custom glyph layer. */
export interface CanvasGlyphSpec {
  shape?: "circle" | "square" | "triangle" | "diamond" | string;
  /** Called with the 2D context when a fully custom drawing is needed. */
  customRender?: (context: CanvasRenderingContext2D, options: {
    size: number;
    x: number;
    y: number;
  }) => void;
  size?: number;
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number;
  label?: string;
  markerOptions?: Record<string, unknown>;
}

/**
 * A `drawGlyph` result. A bare string is treated as HTML and a bare element is
 * used directly.
 */
export type GlyphResult =
  | DomGlyphSpec
  | CanvasGlyphSpec
  | HTMLElement
  | string
  | null
  | undefined;

export interface DrawGlyphContext<P = GeoJsonProperties> {
  /** Value returned by `getGlyphData`, or the feature properties by default. */
  data: any;
  feature: MorphFeature<P>;
  /** Stable id from `getFeatureId`. */
  id: string;
  /** Current position of the glyph, `[lng, lat]`. */
  position: Position;
  morphFactor: number;
  /** Present when `scaleWithZoom` is enabled. */
  zoom?: number;
}

export type DrawGlyph<P = GeoJsonProperties> = (
  context: DrawGlyphContext<P>
) => GlyphResult;

/** Options shared by every glyph layer adapter. */
export interface GlyphLayerBaseOptions<P = GeoJsonProperties> {
  /** Renders each glyph. Required. */
  drawGlyph: DrawGlyph<P>;
  /** @default 0 */
  morphFactor?: number;
  /** Which geometry drives glyph placement. @default "interpolated" */
  geometry?: "regular" | "cartogram" | "interpolated";
  /** Stable identity per feature. @default properties.code ?? properties.id */
  getFeatureId?: (feature: MorphFeature<P>) => string | undefined;
  /** Derives the payload handed to `drawGlyph`. Defaults to feature properties. */
  getGlyphData?: (feature: MorphFeature<P>) => unknown;
  /** Return false to skip a feature. */
  filterFeature?: (feature: MorphFeature<P>) => boolean;
  /** Redraw glyphs on zoom, so `zoom` reaches `drawGlyph`. @default false */
  scaleWithZoom?: boolean;
  /** Supplies features directly instead of deriving them from a morpher. */
  featureProvider?: (options: { morphFactor: number }) => MorphFeature<P>[];
  /** Static feature collection to render, as an alternative to a morpher. */
  featureCollection?: { features: MorphFeature<P>[] };
}

export interface GlyphLayerState {
  morphFactor: number;
  /** Number of glyphs currently mounted. */
  count: number;
  geometry: "regular" | "cartogram" | "interpolated";
}

export interface GlyphLayerHandle {
  /** Re-render glyphs, optionally at a new morph factor. */
  updateGlyphs(options?: { morphFactor?: number }): void;
  /** Remove all glyphs, leaving the layer usable. */
  clear(): void;
  getState(): GlyphLayerState;
  /** Remove glyphs and detach event listeners. */
  destroy(): void;
}

export const DEFAULT_GLYPH_CLASS: string;
export const DEFAULT_ICON_SIZE: [number, number];
export const DEFAULT_ICON_ANCHOR: [number, number];
