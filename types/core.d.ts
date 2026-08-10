import type {
  Aggregations,
  CartogramInput,
  DataRecord,
  FeatureCollection,
  FeatureLookup,
  GeoJsonProperties,
  GridCartogramOptions,
  MorphFeature,
  MorphFeatureCollection,
  Projection,
} from "./common.js";

export interface GeoMorpherOptions {
  /** Source geography, in WGS84, OSGB, or the CRS handled by `projection`. */
  regularGeoJSON: FeatureCollection;
  /**
   * Target geometry. Accepts GeoJSON, a CSV string, or row/col records, in
   * which case a grid cartogram is generated using `cartogramGridOptions`.
   */
  cartogramGeoJSON: CartogramInput;
  /** Tabular rows to join onto the geography. */
  data?: DataRecord[] | null;
  /** Async alternative to `data`, resolved during `prepare()`. */
  getData?: (() => DataRecord[] | Promise<DataRecord[]>) | null;
  /** Property on `data` rows used for the join. @default "lsoa" */
  joinColumn?: string;
  /** Property on GeoJSON features used for the join. @default "code" */
  geoJSONJoinColumn?: string;
  /** Per-column aggregation strategy applied to grouped rows. */
  aggregations?: Aggregations;
  /** Min-max normalise aggregated numeric values to [0, 1]. @default true */
  normalize?: boolean;
  /** Omit to auto-detect WGS84, falling back to OSGB. */
  projection?: Projection | null;
  cartogramGridOptions?: GridCartogramOptions;
}

export interface KeyDataEntry<P = GeoJsonProperties> {
  code: string;
  population: number;
  data: MorphFeature<P>;
}

/**
 * Builds and caches the geometry interpolators used to morph between the
 * regular geography and the cartogram.
 */
export class GeoMorpher<P = GeoJsonProperties> {
  constructor(options: GeoMorpherOptions);

  regularGeoJSON: FeatureCollection;
  cartogramGeoJSON: CartogramInput;
  projection: Projection | null;

  /** Loads data, enriches and reprojects geometry, and builds interpolators. */
  prepare(): Promise<this>;
  isPrepared(): boolean;
  /** @throws if `prepare()` has not completed. */
  assertPrepared(): void;

  /** Normalises `cartogramGeoJSON`, generating a grid cartogram if needed. */
  ensureCartogramGeoJSON(): FeatureCollection;
  loadData(): Promise<DataRecord[]>;

  getKeyData(): Record<string, KeyDataEntry<P>>;
  getRegularFeatureCollection(): MorphFeatureCollection<P>;
  getCartogramFeatureCollection(): MorphFeatureCollection<P>;
  getGeographyLookup(): FeatureLookup<P>;
  getCartogramLookup(): FeatureLookup<P>;

  /**
   * Geometry at a point in the morph.
   * @param factor 0 = regular geography, 1 = cartogram. Clamped to [0, 1].
   */
  getInterpolatedFeatureCollection(factor?: number): MorphFeatureCollection<P>;
  getInterpolatedLookup(factor?: number): FeatureLookup<P>;
}
