import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const loadJSON = async (relativePath) => {
  const fullPath = resolve(__dirname, "..", relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
};

const [regularGeoJSON, cartogramGeoJSON] = await Promise.all([
  loadJSON("data/oxford_lsoas_regular.json"),
  loadJSON("data/oxford_lsoas_cartogram.json"),
]);

import { GeoMorpher, geoMorpher, createLeafletMorphLayers } from "../src/index.js";

const sampleData = [
  {
    lsoa: "E01028513",
    population: 1000,
    households: 400,
  },
  {
    lsoa: "E01028513",
    population: 600,
    households: 200,
  },
  {
    lsoa: "E01028514",
    population: 800,
    households: 300,
  },
];

test("GeoMorpher prepares enriched collections", async () => {
  const morpher = new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    data: sampleData,
    aggregations: {
      population: "sum",
      households: "sum",
    },
  });

  await morpher.prepare();

  const regular = morpher.getRegularFeatureCollection();
  const cartogram = morpher.getCartogramFeatureCollection();
  const tween = morpher.getInterpolatedFeatureCollection(0.25);

  assert.equal(regular.type, "FeatureCollection");
  assert.equal(cartogram.type, "FeatureCollection");
  assert.equal(tween.type, "FeatureCollection");
  assert.equal(regular.features.length, regularGeoJSON.features.length);
  assert.equal(cartogram.features.length, cartogramGeoJSON.features.length);
  assert.ok(Object.keys(morpher.getKeyData()).length > 0);
});

test("geoMorpher legacy wrapper returns structured result", async () => {
  const result = await geoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    data: sampleData,
    aggregations: {
      population: "sum",
    },
    morphFactor: 0.1,
  });

  assert.ok(result.morpher.isPrepared());
  assert.ok(result.tweenLookup);
});

test("Leaflet helper produces layer group", async () => {
  const morpher = new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    data: sampleData,
  });
  await morpher.prepare();

  class GeoJSONLayer {
    constructor(data) {
      this.data = [];
      this.addData(data);
    }

    addData(collection) {
      if (!collection?.features) return;
      this.data = [...collection.features];
    }

    clearLayers() {
      this.data = [];
    }
  }

  const L = {
    geoJSON(data) {
      return new GeoJSONLayer(data);
    },
    layerGroup(layers) {
      return { layers };
    },
  };

  const basemapContainer = {
    style: { filter: "", opacity: "" },
  };

  const basemapLayer = {
    getContainer() {
      return basemapContainer;
    },
  };

  let effectEnabled = true;

  const {
    group,
    tweenLayer,
    updateMorphFactor,
  } = await createLeafletMorphLayers({
    morpher,
    L,
    morphFactor: 0.4,
    basemapLayer,
    basemapEffect: {
      blurRange: [0, 5],
      opacityRange: [1, 0.2],
      isEnabled: () => effectEnabled,
    },
  });

  assert.equal(group.layers.length, 3);
  const initialFeatureCount = tweenLayer.data.length;
  assert.equal(basemapContainer.style.filter, "blur(2.00px)");
  assert.equal(basemapContainer.style.opacity, "0.680");
  updateMorphFactor(0.9);
  assert.equal(tweenLayer.data.length, initialFeatureCount);
  assert.equal(basemapContainer.style.filter, "blur(4.50px)");
  assert.equal(basemapContainer.style.opacity, "0.280");

  updateMorphFactor(0);
  assert.equal(basemapContainer.style.filter, "");
  assert.equal(basemapContainer.style.opacity, "");

  effectEnabled = false;
  updateMorphFactor(0.9);
  assert.equal(basemapContainer.style.filter, "");
  assert.equal(basemapContainer.style.opacity, "");

  effectEnabled = true;
  updateMorphFactor(0.9);
  assert.equal(basemapContainer.style.filter, "blur(4.50px)");
  assert.equal(basemapContainer.style.opacity, "0.280");
});
