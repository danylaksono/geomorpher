import type { GeoJsonProperties, MorphFeature } from "./common.js";
import type { GeoMorpher } from "./core.js";
import type { GlyphLayerBaseOptions, GlyphLayerHandle } from "./glyph.js";

/**
 * The Leaflet namespace (`L`) and its layer types.
 *
 * Typed as `any` on purpose: `leaflet` is an optional peer dependency, so these
 * declarations must not require `@types/leaflet` to be installed.
 */
export type LeafletNamespace = any;
export type LeafletLayer = any;
export type LeafletMap = any;

/** A Leaflet path style, or a function producing one per feature. */
export type LeafletStyle<P = GeoJsonProperties> =
  | Record<string, unknown>
  | ((feature: MorphFeature<P>) => Record<string, unknown>);

export interface LeafletMorphLayerOptions<P = GeoJsonProperties> {
  morpher: GeoMorpher;
  /** The Leaflet namespace, i.e. `import L from "leaflet"`. */
  L: LeafletNamespace;
  /** Initial morph factor. @default 0 */
  morphFactor?: number;
  regularStyle?: LeafletStyle<P>;
  cartogramStyle?: LeafletStyle<P>;
  /** Style for the interpolated layer. */
  tweenStyle?: LeafletStyle<P>;
  /** Standard Leaflet `onEachFeature` hook, applied to every generated layer. */
  onEachFeature?: (feature: MorphFeature<P>, layer: LeafletLayer) => void;
  /** Basemap tile layer faded as the morph progresses. */
  basemapLayer?: LeafletLayer;
  /** Opacity range for `basemapLayer`, as `[atFactor0, atFactor1]`. */
  basemapEffect?: { opacity?: [number, number] } & Record<string, unknown>;
}

export interface LeafletMorphHandle {
  /** Layer group holding all three generated layers. */
  group: LeafletLayer;
  regularLayer: LeafletLayer;
  cartogramLayer: LeafletLayer;
  tweenLayer: LeafletLayer;
  /** Redraw the interpolated layer at the given factor. */
  updateMorphFactor(factor: number): void;
}

/** @deprecated Prefer the MapLibre adapter; Leaflet is kept for compatibility. */
export function createLeafletMorphLayers<P = GeoJsonProperties>(
  options: LeafletMorphLayerOptions<P>
): Promise<LeafletMorphHandle>;

export interface LeafletGlyphLayerOptions<P = GeoJsonProperties>
  extends GlyphLayerBaseOptions<P> {
  L: LeafletNamespace;
  map?: LeafletMap;
  morpher?: GeoMorpher;
  /** Options forwarded to each `L.Marker`. */
  markerOptions?: Record<string, unknown>;
  /** Leaflet pane the glyph markers are added to. */
  pane?: string;
}

export interface LeafletGlyphHandle extends GlyphLayerHandle {
  /** The layer group holding the glyph markers. */
  layer: LeafletLayer;
}

/** @deprecated Prefer the MapLibre adapter; Leaflet is kept for compatibility. */
export function createLeafletGlyphLayer<P = GeoJsonProperties>(
  options: LeafletGlyphLayerOptions<P>
): Promise<LeafletGlyphHandle>;

/** Builds an `L.divIcon` from a normalized glyph result. */
export function createLeafletIcon(options: {
  L: LeafletNamespace;
  normalized: unknown;
  pane?: string;
}): LeafletLayer | null;

export {
  DEFAULT_GLYPH_CLASS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_ANCHOR,
} from "./glyph.js";

/** Default geometry source for glyph placement. */
export const DEFAULT_GEOMETRY: "regular" | "cartogram" | "interpolated";
