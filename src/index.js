import { GeoMorpher } from "./core/geomorpher.js";
import { createLeafletMorphLayers, createLeafletGlyphLayer } from "./adapters/leaflet/index.js";
import { createMapLibreMorphLayers, createMapLibreGlyphLayer } from "./adapters/maplibre/index.js";
import { WGS84Projection, WebMercatorProjection, isLikelyWGS84, createProj4Projection } from "./utils/projections.js";
import { parseCSV } from "./utils/csv.js";
import {
	createGridCartogramFeatureCollection,
	normalizeCartogramInput,
} from "./utils/cartogram.js";

export { 
  GeoMorpher, 
  createLeafletMorphLayers, 
  createLeafletGlyphLayer,
	createMapLibreMorphLayers,
	createMapLibreGlyphLayer,
  WGS84Projection,
  WebMercatorProjection,
  isLikelyWGS84,
	createProj4Projection,
	parseCSV,
	createGridCartogramFeatureCollection,
	normalizeCartogramInput,
};

export async function geoMorpher(options) {
	const morpher = new GeoMorpher(options);
	await morpher.prepare();
	return {
		morpher,
		keyData: morpher.getKeyData(),
		regularGeodataLookup: morpher.getGeographyLookup(),
		regularGeodataWgs84: morpher.getRegularFeatureCollection(),
		cartogramGeodataLookup: morpher.getCartogramLookup(),
		cartogramGeodataWgs84: morpher.getCartogramFeatureCollection(),
		tweenLookup: morpher.getInterpolatedLookup(options?.morphFactor ?? 0.5),
	};
}
