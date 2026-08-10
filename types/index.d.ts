import type {
  CartogramInput,
  DataRecord,
  FeatureCollection,
  FeatureLookup,
  GeoJsonProperties,
  Geometry,
  GridCartogramOptions,
  MorphFeatureCollection,
  Position,
  Projection,
} from "./common.js";
import type { GeoMorpherOptions, KeyDataEntry } from "./core.js";
import { GeoMorpher } from "./core.js";

export * from "./common.js";
export * from "./glyph.js";
export * from "./core.js";
export * from "./maplibre.js";
export * from "./leaflet.js";

import {
  createMapLibreMorphLayers,
  createMapLibreGlyphLayer,
} from "./maplibre.js";

/** Alias of {@link createMapLibreMorphLayers}, the default adapter. */
export const createMorphLayers: typeof createMapLibreMorphLayers;
/** Alias of {@link createMapLibreGlyphLayer}, the default adapter. */
export const createGlyphLayer: typeof createMapLibreGlyphLayer;

/** Identity projection, for data already in WGS84 lng/lat. */
export const WGS84Projection: Projection;
/** Web Mercator (EPSG:3857) to WGS84. */
export const WebMercatorProjection: Projection;

/**
 * Heuristically classifies a collection's coordinate system from its first
 * coordinate pair. Returns `null` when no coordinates can be read.
 */
export function isLikelyWGS84(
  geojson: FeatureCollection | null | undefined
): "WGS84" | "OSGB" | "UNKNOWN" | null;

/**
 * Builds a projection from a proj4 definition.
 *
 * @param projDefinition e.g. `"+proj=utm +zone=33 +datum=WGS84"`
 * @param proj4Instance Falls back to `window.proj4` / `globalThis.proj4`.
 * @throws if proj4 cannot be resolved.
 */
export function createProj4Projection(
  projDefinition: string,
  proj4Instance?: unknown
): Projection;

export interface ParseCSVOptions {
  /** @default "," */
  delimiter?: string;
  /** Trim whitespace around each field. @default true */
  trim?: boolean;
  /** Treat the first row as a header. @default true */
  headers?: boolean;
}

/**
 * RFC-4180-style CSV parser with quoted-field support.
 *
 * Returns records keyed by header, or raw string rows when `headers` is false.
 * @throws TypeError if `text` is not a string.
 */
export function parseCSV(
  text: string,
  options?: ParseCSVOptions & { headers?: true }
): Record<string, string>[];
export function parseCSV(
  text: string,
  options: ParseCSVOptions & { headers: false }
): string[][];

/** Builds a grid cartogram FeatureCollection from row/col records. */
export function createGridCartogramFeatureCollection(options: {
  records: DataRecord[];
  /** Used to derive the extent when `gridOptions.extent` is omitted. */
  regularGeoJSON?: FeatureCollection;
  /** @default "code" */
  joinProperty?: string;
  gridOptions?: GridCartogramOptions;
}): FeatureCollection;

/**
 * Coerces any accepted cartogram input into a FeatureCollection, generating a
 * grid cartogram when given CSV text or row/col records.
 */
export function normalizeCartogramInput(options: {
  input: CartogramInput;
  regularGeoJSON?: FeatureCollection;
  joinProperty?: string;
  gridOptions?: GridCartogramOptions;
}): FeatureCollection;

/** Flattens any geometry into a flat list of positions. */
export function flattenPositions(
  geometry: Geometry | null | undefined
): Position[];

export interface GeoMorpherBundle<P = GeoJsonProperties> {
  morpher: GeoMorpher<P>;
  keyData: Record<string, KeyDataEntry<P>>;
  regularGeodataLookup: FeatureLookup<P>;
  regularGeodataWgs84: MorphFeatureCollection<P>;
  cartogramGeodataLookup: FeatureLookup<P>;
  cartogramGeodataWgs84: MorphFeatureCollection<P>;
  tweenLookup: FeatureLookup<P>;
}

/**
 * Convenience wrapper: constructs a {@link GeoMorpher}, prepares it, and
 * returns it alongside its derived collections.
 */
export function geoMorpher<P = GeoJsonProperties>(
  options: GeoMorpherOptions & { morphFactor?: number }
): Promise<GeoMorpherBundle<P>>;
