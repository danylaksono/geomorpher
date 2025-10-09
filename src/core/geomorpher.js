import cloneDeep from "lodash/cloneDeep.js";
import keyBy from "lodash/keyBy.js";
import mapValues from "lodash/mapValues.js";
import flubber from "flubber";
import * as turf from "@turf/turf";
import { enrichGeoData, createLookup } from "../utils/enrichment.js";
import { toWGS84FeatureCollection } from "../utils/projection.js";
import { normalizeCartogramInput } from "../utils/cartogram.js";

const clampFactor = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const RING_VISIBILITY_EPSILON = 1e-3;
const PLACEHOLDER_SCALE = 0.02;
const MIN_PLACEHOLDER_SIZE = 1e-4;

const ensureClosedRing = (ring) => {
  if (!Array.isArray(ring) || ring.length === 0) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!Array.isArray(first) || !Array.isArray(last)) return [];
  if (first.length < 2 || last.length < 2) return [];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice();
  }
  return [...ring, first];
};

const extractOuterRings = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates?.[0];
    return ring ? [ensureClosedRing(ring)] : [];
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return polygons
      .map((polygon) => (Array.isArray(polygon) && polygon[0] ? ensureClosedRing(polygon[0]) : null))
      .filter((ring) => Array.isArray(ring) && ring.length >= 3);
  }
  return [];
};

const computeRingCentroid = (ring) => {
  if (!Array.isArray(ring) || ring.length === 0) return [0, 0];
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const coordinate of ring) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    const [x, y] = coordinate;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sumX += x;
    sumY += y;
    count += 1;
  }
  if (count === 0) return [0, 0];
  return [sumX / count, sumY / count];
};

const computeRingBounds = (ring) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const coordinate of ring ?? []) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    const [x, y] = coordinate;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0),
  };
};

const createPlaceholderRing = (referenceRing) => {
  if (!Array.isArray(referenceRing) || referenceRing.length === 0) return null;
  const centroid = computeRingCentroid(referenceRing);
  const [cx, cy] = centroid;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const { width, height } = computeRingBounds(referenceRing);
  const span = Math.max(width, height);
  const offset = Math.max(span * PLACEHOLDER_SCALE, MIN_PLACEHOLDER_SIZE);

  const ring = [
    [cx - offset, cy - offset],
    [cx + offset, cy - offset],
    [cx + offset, cy + offset],
    [cx - offset, cy + offset],
  ];

  return ensureClosedRing(ring);
};

const distanceSquared = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return Number.POSITIVE_INFINITY;
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

const matchRingPairs = (fromRings, toRings) => {
  const pairs = [];
  const toPool = toRings.map((ring) => ({
    ring,
    centroid: computeRingCentroid(ring),
  }));

  for (const ring of fromRings) {
    const centroid = computeRingCentroid(ring);
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < toPool.length; index += 1) {
      const candidate = toPool[index];
      const candidateDistance = distanceSquared(centroid, candidate.centroid);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0) {
      const [match] = toPool.splice(bestIndex, 1);
      pairs.push({ fromRing: ring, toRing: match.ring });
    } else {
      pairs.push({ fromRing: ring, toRing: null });
    }
  }

  for (const remaining of toPool) {
    pairs.push({ fromRing: null, toRing: remaining.ring });
  }

  return pairs;
};

const createRingInterpolator = ({ fromRing, toRing }) => {
  if (fromRing && toRing) {
    const interpolator = flubber.interpolate(fromRing, toRing, { string: false });
    return {
      interpolate: (factor) => interpolator(factor),
      isVisible: () => true,
    };
  }

  if (fromRing && !toRing) {
    const placeholder = createPlaceholderRing(fromRing);
    if (!placeholder) {
      const constantRing = ensureClosedRing(fromRing);
      return {
        interpolate: () => constantRing,
        isVisible: (factor) => factor < 1 - RING_VISIBILITY_EPSILON,
      };
    }

    const interpolator = flubber.interpolate(fromRing, placeholder, { string: false });
    return {
      interpolate: (factor) => interpolator(factor),
      isVisible: (factor) => factor < 1 - RING_VISIBILITY_EPSILON,
    };
  }

  if (!fromRing && toRing) {
    const placeholder = createPlaceholderRing(toRing);
    if (!placeholder) {
      const constantRing = ensureClosedRing(toRing);
      return {
        interpolate: () => constantRing,
        isVisible: (factor) => factor > RING_VISIBILITY_EPSILON,
      };
    }

    const interpolator = flubber.interpolate(placeholder, toRing, { string: false });
    return {
      interpolate: (factor) => interpolator(factor),
      isVisible: (factor) => factor > RING_VISIBILITY_EPSILON,
    };
  }

  return null;
};

const createGeometryInterpolator = ({ fromGeometry, toGeometry }) => {
  const fromRings = extractOuterRings(fromGeometry);
  const toRings = extractOuterRings(toGeometry);

  if (!fromRings.length && !toRings.length) {
    return null;
  }

  const pairs = matchRingPairs(fromRings, toRings);
  const ringInterpolators = pairs
    .map((pair) => createRingInterpolator(pair))
    .filter((entry) => entry && typeof entry.interpolate === "function");

  if (!ringInterpolators.length) {
    return null;
  }

  const geometryType =
    ringInterpolators.length === 1 && fromGeometry?.type !== "MultiPolygon" && toGeometry?.type !== "MultiPolygon"
      ? "Polygon"
      : "MultiPolygon";

  return {
    type: geometryType,
    interpolate: (rawFactor) => {
      const factor = clampFactor(rawFactor);
      const rings = [];

      for (const entry of ringInterpolators) {
        if (typeof entry.isVisible === "function" && !entry.isVisible(factor)) {
          continue;
        }

        try {
          rings.push(ensureClosedRing(entry.interpolate(factor)));
        } catch (error) {
          rings.push([]);
        }
      }

      const filteredRings = rings.filter((ring) => Array.isArray(ring) && ring.length >= 4);
      const effectiveRings = filteredRings.length ? filteredRings : rings;

      if (geometryType === "Polygon") {
        const ring = effectiveRings.find((candidate) => Array.isArray(candidate) && candidate.length >= 4) ?? [];
        return [ring];
      }

      const multiRings = effectiveRings.filter((ring) => Array.isArray(ring) && ring.length >= 4);
      const ringsToUse = multiRings.length ? multiRings : effectiveRings;
      return ringsToUse.map((ring) => [ring]);
    },
  };
};

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
    projection = null,
    cartogramGridOptions = {},
  }) {
    this.regularGeoJSON = regularGeoJSON;
    this.cartogramGeoJSON = cartogramGeoJSON;
    this.data = data;
    this.getData = getData;
    this.joinColumn = joinColumn;
    this.geoJSONJoinColumn = geoJSONJoinColumn;
    this.aggregations = aggregations;
    this.normalize = normalize;
    this.projection = projection;
    this.cartogramGridOptions = cartogramGridOptions ?? {};

    this._normalizedCartogramGeoJSON = null;

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

  ensureCartogramGeoJSON() {
    if (this._normalizedCartogramGeoJSON) {
      return this._normalizedCartogramGeoJSON;
    }

    this._normalizedCartogramGeoJSON = normalizeCartogramInput({
      input: this.cartogramGeoJSON,
      regularGeoJSON: this.regularGeoJSON,
      joinProperty: this.geoJSONJoinColumn,
      gridOptions: this.cartogramGridOptions,
    });

    return this._normalizedCartogramGeoJSON;
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

    const baseCartogramGeoJSON = this.ensureCartogramGeoJSON();

    const cartogramEnriched = enrichGeoData({
      data: modelData,
      geojson: cloneDeep(baseCartogramGeoJSON),
      joinColumn: this.joinColumn,
      geoJSONJoinColumn: this.geoJSONJoinColumn,
      aggregations: this.aggregations,
      normalize: this.normalize,
    });

    const regularWGS84 = toWGS84FeatureCollection(regularEnriched, this.projection);
    const cartogramWGS84 = toWGS84FeatureCollection(cartogramEnriched, this.projection);

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
      const cartogramFeature = cartogramLookup[code];
      const geometryInterpolator = createGeometryInterpolator({
        fromGeometry: feature?.geometry,
        toGeometry: cartogramFeature?.geometry,
      });

      if (!geometryInterpolator) continue;

      interpolators[code] = geometryInterpolator;
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
    const features = [];

    for (const [code, entry] of Object.entries(this.state.interpolators)) {
      if (!entry || typeof entry.interpolate !== "function") continue;
      const baseFeature = this.state.geographyLookup[code];
      if (!baseFeature) continue;

      const coordinates = entry.interpolate(factor);

      if (!coordinates || !Array.isArray(coordinates) || !coordinates.length) continue;

      const geometry = entry.type === "MultiPolygon"
        ? { type: "MultiPolygon", coordinates }
        : { type: "Polygon", coordinates };

      features.push({
        type: "Feature",
        properties: {
          ...baseFeature.properties,
          code,
          morph_factor: factor,
        },
        geometry,
      });
    }

    return turf.featureCollection(features.map(withCentroid));
  }

  getInterpolatedLookup(factor = 0.5) {
    const collection = this.getInterpolatedFeatureCollection(factor);
    return createLookup(collection.features, (feature) =>
      feature?.properties?.[this.geoJSONJoinColumn]
    );
  }
}
