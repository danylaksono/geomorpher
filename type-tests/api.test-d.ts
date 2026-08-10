/**
 * Type-level smoke test. Never executed — `npm run typecheck` compiles it to
 * verify the shipped declarations describe the public API usefully.
 */
import {
  GeoMorpher,
  geoMorpher,
  createMapLibreMorphLayers,
  createMapLibreGlyphLayer,
  createMorphLayers,
  createLeafletMorphLayers,
  parseCSV,
  createProj4Projection,
  isLikelyWGS84,
  flattenPositions,
  createGridCartogramFeatureCollection,
  WGS84Projection,
  WebMercatorProjection,
  type Projection,
  type DrawGlyph,
  type MorphFeatureCollection,
  type FeatureCollection,
} from "../types/index.js";

declare const fc: FeatureCollection;
declare const maplibregl: any;
declare const map: any;
declare const L: any;

// --- core -------------------------------------------------------------------
const morpher = new GeoMorpher({
  regularGeoJSON: fc,
  cartogramGeoJSON: fc,
  data: [{ lsoa: "E01", population: 10 }],
  joinColumn: "lsoa",
  geoJSONJoinColumn: "code",
  aggregations: { population: "sum", tenure: "categories" },
  normalize: true,
});

await morpher.prepare();
const prepared: boolean = morpher.isPrepared();
const interpolated: MorphFeatureCollection = morpher.getInterpolatedFeatureCollection(0.5);
const centroid = interpolated.features[0]?.centroid;
const lookup = morpher.getInterpolatedLookup(0.25);
const keyData = morpher.getKeyData();
const pop: number = Object.values(keyData)[0]!.population;

// cartogram generated from row/col records rather than GeoJSON
new GeoMorpher({
  regularGeoJSON: fc,
  cartogramGeoJSON: "id,row,col\nE01,0,1",
  cartogramGridOptions: { cellPadding: 0.1, rowOrientation: "bottom" },
});

// --- maplibre ---------------------------------------------------------------
const morph = await createMapLibreMorphLayers({
  morpher,
  map,
  interpolatedStyle: { paint: { "fill-color": "#22c55e", "fill-opacity": 0.4 } },
  basemapEffect: {
    layers: ["osm-tiles"],
    properties: { "raster-opacity": [1, 0.25], "raster-saturation": [0, -1] },
  },
});

morph.updateMorphFactor(0.5);
morph.setLayerVisibility({ regular: false, interpolated: "visible" });
const layerId: string = morph.layerIds.interpolated;
const factor: number = morph.getState().morphFactor;
morph.remove();

// the default-adapter alias must accept the same options
await createMorphLayers({ morpher, map });

const draw: DrawGlyph = ({ data, feature, morphFactor }) => ({
  html: `<div>${morphFactor}</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const glyphs = await createMapLibreGlyphLayer({
  morpher,
  map,
  drawGlyph: draw,
  geometry: "interpolated",
  scaleWithZoom: true,
  maplibreNamespace: maplibregl,
});
glyphs.updateGlyphs({ morphFactor: 0.5 });
const glyphCount: number = glyphs.getState().count;
glyphs.destroy();

// canvas-flavoured glyph result
await createMapLibreGlyphLayer({
  morpher,
  map,
  drawGlyph: () => ({ shape: "circle", size: 12, fillColor: "#f00" }),
});

// --- leaflet ----------------------------------------------------------------
const leaflet = await createLeafletMorphLayers({
  morpher,
  L,
  tweenStyle: (feature) => ({ color: feature.properties?.code ?? "#000" }),
});
leaflet.updateMorphFactor(1);

// --- utilities --------------------------------------------------------------
const records: Record<string, string>[] = parseCSV("id,row\nA,1");
const rows: string[][] = parseCSV("a,b", { headers: false });
const projection: Projection = createProj4Projection("+proj=utm +zone=33 +datum=WGS84");
const crs = isLikelyWGS84(fc);
const positions = flattenPositions({ type: "Point", coordinates: [0, 0] });
const lng: number = positions[0]![0]!;
createGridCartogramFeatureCollection({ records: [{ id: "A", row: 0, col: 1 }] });
const identity: Projection = WGS84Projection;
const mercator: Projection = WebMercatorProjection;

const bundle = await geoMorpher({ regularGeoJSON: fc, cartogramGeoJSON: fc, morphFactor: 0.5 });
const bundleFeatures = bundle.regularGeodataWgs84.features;

// --- expected type errors ---------------------------------------------------
// @ts-expect-error regularGeoJSON is required
new GeoMorpher({ cartogramGeoJSON: fc });
// @ts-expect-error unknown aggregation strategy
new GeoMorpher({ regularGeoJSON: fc, cartogramGeoJSON: fc, aggregations: { a: "median" } });
// @ts-expect-error morph factor must be a number
morph.updateMorphFactor("0.5");
// @ts-expect-error drawGlyph is required
await createMapLibreGlyphLayer({ morpher, map });
// @ts-expect-error geometry must be one of the three known sources
await createMapLibreGlyphLayer({ morpher, map, drawGlyph: draw, geometry: "tween" });

export {
  prepared, centroid, lookup, pop, layerId, factor, glyphCount,
  records, rows, projection, crs, lng, identity, mercator, bundleFeatures,
  interpolated, morph, glyphs, leaflet, bundle,
};
