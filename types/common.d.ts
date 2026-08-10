import type {
  Feature,
  FeatureCollection,
  Geometry,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";

export type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon, Position };

/** A polygonal feature carrying the anchor point geo-morpher computes for it. */
export interface MorphFeature<P = GeoJsonProperties>
  extends Feature<Polygon | MultiPolygon, P> {
  /** Interpolated anchor point ([lng, lat]) used to position glyphs. */
  centroid?: Position;
}

export type GeoJsonProperties = { [name: string]: any } | null;

export type MorphFeatureCollection<P = GeoJsonProperties> = Omit<
  FeatureCollection<Polygon | MultiPolygon, P>,
  "features"
> & {
  features: MorphFeature<P>[];
};

/** Lookup of features keyed by their join column value. */
export type FeatureLookup<P = GeoJsonProperties> = Record<string, MorphFeature<P>>;

/**
 * Converts a coordinate from the source CRS into WGS84 `[lng, lat]`.
 * Supply one when your data is not already in WGS84 or OSGB.
 */
export interface Projection {
  toGeo(coordinate: Position): Position;
  name?: string;
}

/** Aggregation strategies available when joining tabular data onto geometry. */
export type AggregationType =
  | "sum"
  | "mean"
  | "count"
  | "unique_count"
  | "array"
  | "min"
  | "max"
  | "categories";

export type Aggregations = Record<string, AggregationType>;

/** A row of tabular data joined onto the geography. */
export type DataRecord = Record<string, unknown>;

export interface GridCartogramOptions {
  rowField?: string;
  colField?: string;
  idField?: string;
  includeSourceProperties?: boolean;
  /** Fraction of a cell left empty as padding. Clamped to [0, 0.49]. */
  cellPadding?: number;
  rowOrientation?: "top" | "bottom";
  colOrientation?: "left" | "right";
  /** `[minX, minY, maxX, maxY]`. Derived from `regularGeoJSON` when omitted. */
  extent?: [number, number, number, number];
}

/**
 * Accepted cartogram inputs: a GeoJSON object, a CSV string with row/col
 * columns, or an array of row/col records.
 */
export type CartogramInput =
  | FeatureCollection
  | Feature
  | Geometry
  | string
  | DataRecord[];
