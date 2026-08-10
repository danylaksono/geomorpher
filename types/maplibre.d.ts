import type { GeoJsonProperties, MorphFeatureCollection } from "./common.js";
import type { GeoMorpher } from "./core.js";
import type {
  GlyphLayerBaseOptions,
  GlyphLayerHandle,
} from "./glyph.js";

/**
 * A `maplibregl.Map` instance.
 *
 * Typed as `any` on purpose: `maplibre-gl` is an optional peer dependency, so
 * these declarations must not require its types to be installed.
 */
export type MapLibreMap = any;

/** The `maplibre-gl` module namespace, i.e. the result of `import maplibregl from "maplibre-gl"`. */
export type MapLibreNamespace = any;

/** A MapLibre paint/layout style fragment applied to a generated fill layer. */
export interface MapLibreLayerStyle {
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown[];
  /** Overrides the generated layer `type`. @default "fill" */
  type?: string;
  [option: string]: unknown;
}

/**
 * Drives basemap paint properties from the morph factor, so the basemap can
 * fade or desaturate as the cartogram forms.
 */
export interface BasemapEffect {
  /** Layer ids to affect, or a resolver called with the map. */
  layers: string[] | string | ((context: { map: MapLibreMap }) => string[] | string);
  /**
   * Paint property ranges, e.g. `{ "raster-opacity": [1, 0.25] }`, where the
   * first entry applies at factor 0 and the second at factor 1.
   */
  properties?: Record<
    string,
    [unknown, unknown] | { from?: unknown; to?: unknown } | number
  >;
  /** Per-layer overrides of `properties`, keyed by layer id. */
  layerProperties?: Record<string, Record<string, unknown>>;
  /** Clamps applied per property, e.g. `{ "raster-opacity": [0, 1] }`. */
  propertyClamp?: Record<string, [number, number]>;
  /** Post-processes an interpolated value before it is applied. */
  propertyTransforms?: Record<string, (value: unknown) => unknown>;
}

export interface MapLibreMorphLayerOptions {
  morpher: GeoMorpher;
  map: MapLibreMap;
  /** Initial morph factor. @default 0 */
  morphFactor?: number;
  /** Prefix for generated source and layer ids. @default "geomorpher" */
  idBase?: string;
  regularStyle?: MapLibreLayerStyle;
  cartogramStyle?: MapLibreLayerStyle;
  interpolatedStyle?: MapLibreLayerStyle;
  /** Insert the generated layers below this existing layer id. */
  beforeId?: string;
  basemapEffect?: BasemapEffect;
}

export interface MapLibreMorphIds {
  regular: string;
  cartogram: string;
  interpolated: string;
}

export interface MapLibreMorphHandle<P = GeoJsonProperties> {
  sourceIds: MapLibreMorphIds;
  layerIds: MapLibreMorphIds;
  /**
   * Move the morph and push new geometry to the interpolated source.
   * @throws if the factor is not finite or the source has been removed.
   */
  updateMorphFactor(factor: number): MorphFeatureCollection<P>;
  setLayerVisibility(visibility: {
    regular?: boolean | "visible" | "none";
    cartogram?: boolean | "visible" | "none";
    interpolated?: boolean | "visible" | "none";
  }): void;
  /** Re-apply the basemap effect at a given factor. */
  applyBasemapEffect(factor: number): void;
  /** Remove all generated layers and sources, restoring basemap paint. */
  remove(): void;
  getState(): {
    sourceIds: MapLibreMorphIds;
    layerIds: MapLibreMorphIds;
    morphFactor: number;
  };
}

/** Creates regular, cartogram, and interpolated sources plus their fill layers. */
export function createMapLibreMorphLayers<P = GeoJsonProperties>(
  options: MapLibreMorphLayerOptions
): Promise<MapLibreMorphHandle<P>>;

export interface MapLibreGlyphLayerOptions<P = GeoJsonProperties>
  extends GlyphLayerBaseOptions<P> {
  map: MapLibreMap;
  morpher?: GeoMorpher;
  /** Options forwarded to each `maplibregl.Marker`. */
  markerOptions?: Record<string, unknown>;
  /** Defaults to `globalThis.maplibregl` when omitted. */
  maplibreNamespace?: MapLibreNamespace;
}

/** DOM-marker glyph overlay, synced to the morphing geometry. */
export function createMapLibreGlyphLayer<P = GeoJsonProperties>(
  options: MapLibreGlyphLayerOptions<P>
): Promise<GlyphLayerHandle>;

export interface MapLibreCustomGlyphLayerOptions<P = GeoJsonProperties>
  extends GlyphLayerBaseOptions<P> {
  map: MapLibreMap;
  morpher?: GeoMorpher;
  /** Options forwarded to the canvas glyph renderer. */
  glyphOptions?: Record<string, unknown>;
  maplibreNamespace?: MapLibreNamespace;
}

/** Canvas-based glyph layer, for glyph counts too high for DOM markers. */
export function createMapLibreCustomGlyphLayer<P = GeoJsonProperties>(
  options: MapLibreCustomGlyphLayerOptions<P>
): Promise<GlyphLayerHandle>;

/** Converts a normalized glyph result into MapLibre marker inputs. */
export function createMapLibreMarkerData(options: {
  normalized: unknown;
}): Record<string, unknown> | null;
