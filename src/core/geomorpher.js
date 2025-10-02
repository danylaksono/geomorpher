import cloneDeep from "lodash/cloneDeep.js";
import keyBy from "lodash/keyBy.js";
import mapValues from "lodash/mapValues.js";
import flubber from "flubber";
import * as turf from "@turf/turf";
import { enrichGeoData, createLookup } from "../utils/enrichment.js";
import { toWGS84FeatureCollection } from "../utils/projection.js";

function getPrimaryRing(geometry) {
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return geometry.coordinates[0];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates[0][0];
  }

  return null;
}

function withCentroid(feature) {
  const centroid = turf.centroid(feature);
  return {
    ...feature,
    centroid: turf.getCoord(centroid),
  };
}

export class GeoMorpher {
  constructor({
    regularGeoJSON,
    cartogramGeoJSON,
    data = null,
    getData = null,
    joinColumn = "lsoa",
    geoJSONJoinColumn = "code",
    aggregations = {},
    normalize = true,
  }) {
    this.regularGeoJSON = regularGeoJSON;
    this.cartogramGeoJSON = cartogramGeoJSON;
    this.data = data;
    this.getData = getData;
    this.joinColumn = joinColumn;
    this.geoJSONJoinColumn = geoJSONJoinColumn;
    this.aggregations = aggregations;
    this.normalize = normalize;

    this.state = {
      prepared: false,
      regularEnriched: null,
      cartogramEnriched: null,
      regularWGS84: null,
      cartogramWGS84: null,
      geographyLookup: {},
      cartogramLookup: {},
      keyData: {},
      interpolators: {},
    };
  }

  async prepare() {
    const modelData = await this.loadData();

    const regularEnriched = enrichGeoData({
      data: modelData,
      geojson: cloneDeep(this.regularGeoJSON),
      joinColumn: this.joinColumn,
      geoJSONJoinColumn: this.geoJSONJoinColumn,
      aggregations: this.aggregations,
      normalize: this.normalize,
    });

    const cartogramEnriched = enrichGeoData({
      data: modelData,
      geojson: cloneDeep(this.cartogramGeoJSON),
      joinColumn: this.joinColumn,
      geoJSONJoinColumn: this.geoJSONJoinColumn,
      aggregations: this.aggregations,
      normalize: this.normalize,
    });

    const regularWGS84 = toWGS84FeatureCollection(regularEnriched);
    const cartogramWGS84 = toWGS84FeatureCollection(cartogramEnriched);

    const geographyLookup = createLookup(regularWGS84.features, (feature) =>
      feature?.properties?.[this.geoJSONJoinColumn]
    );
    const cartogramLookup = createLookup(cartogramWGS84.features, (feature) =>
      feature?.properties?.[this.geoJSONJoinColumn]
    );

    const keyData = keyBy(
      regularEnriched.features.map((feature) => ({
        code: feature.properties?.[this.geoJSONJoinColumn],
        population: Number(feature.properties?.population ?? 0),
        data: feature,
      })),
      "code"
    );

    const interpolators = {};
    for (const [code, feature] of Object.entries(geographyLookup)) {
      const regularRing = getPrimaryRing(feature.geometry);
      const cartogramRing = getPrimaryRing(cartogramLookup[code]?.geometry);
      if (!regularRing || !cartogramRing) continue;

      interpolators[code] = flubber.interpolate(regularRing, cartogramRing, {
        string: false,
      });
    }

    this.state = {
      prepared: true,
      regularEnriched,
      cartogramEnriched,
      regularWGS84: {
        ...regularWGS84,
        features: regularWGS84.features.map(withCentroid),
      },
      cartogramWGS84: {
        ...cartogramWGS84,
        features: cartogramWGS84.features.map(withCentroid),
      },
      geographyLookup: mapValues(geographyLookup, withCentroid),
      cartogramLookup: mapValues(cartogramLookup, withCentroid),
      keyData,
      interpolators,
    };

    return this;
  }

  async loadData() {
    if (Array.isArray(this.data)) return this.data;
    if (typeof this.getData === "function") {
      const result = await this.getData();
      this.data = result;
      return result;
    }
    return [];
  }

  isPrepared() {
    return Boolean(this.state.prepared);
  }

  assertPrepared() {
    if (!this.isPrepared()) {
      throw new Error("GeoMorpher.prepare() must be called before accessing data");
    }
  }

  getKeyData() {
    this.assertPrepared();
    return this.state.keyData;
  }

  getRegularFeatureCollection() {
    this.assertPrepared();
    return cloneDeep(this.state.regularWGS84);
  }

  getCartogramFeatureCollection() {
    this.assertPrepared();
    return cloneDeep(this.state.cartogramWGS84);
  }

  getGeographyLookup() {
    this.assertPrepared();
    return cloneDeep(this.state.geographyLookup);
  }

  getCartogramLookup() {
    this.assertPrepared();
    return cloneDeep(this.state.cartogramLookup);
  }

  getInterpolatedFeatureCollection(factor = 0.5) {
    this.assertPrepared();
    const features = Object.entries(this.state.interpolators).map(
      ([code, interpolate]) => {
        const coords = interpolate(factor);
        const baseFeature = this.state.geographyLookup[code];
        return {
          type: "Feature",
          properties: {
            ...baseFeature.properties,
            code,
            morph_factor: factor,
          },
          geometry: {
            type: "Polygon",
            coordinates: [coords],
          },
        };
      }
    );

    return turf.featureCollection(features.map(withCentroid));
  }

  getInterpolatedLookup(factor = 0.5) {
    const collection = this.getInterpolatedFeatureCollection(factor);
    return createLookup(collection.features, (feature) =>
      feature?.properties?.[this.geoJSONJoinColumn]
    );
  }
}
