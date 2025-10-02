import { GeoMorpher } from "./core/geomorpher.js";
import { createLeafletMorphLayers } from "./adapters/leaflet.js";

export { GeoMorpher, createLeafletMorphLayers };

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
