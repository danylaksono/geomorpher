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

import {
  GeoMorpher,
  geoMorpher,
  createLeafletMorphLayers,
  createLeafletGlyphLayer,
  createMapLibreGlyphLayer,
  createGridCartogramFeatureCollection,
} from "../src/index.js";

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

test("Glyph layer renders markers and updates with morph factor", async () => {
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

  class FakeDivIcon {
    constructor(options) {
      this.options = options;
    }
  }

  class FakeMarker {
    constructor(latlng, options = {}) {
      this.latlng = latlng;
      this.options = options;
      this.icon = options.icon ?? null;
      this.parentGroup = null;
    }

    setLatLng(latlng) {
      this.latlng = latlng;
    }

    setIcon(icon) {
      this.icon = icon;
    }

    addTo(group) {
      if (group?.addLayer) {
        group.addLayer(this);
      }
      return this;
    }

    remove() {
      if (this.parentGroup?.removeLayer) {
        this.parentGroup.removeLayer(this);
      }
    }
  }

  class FakeLayerGroup {
    constructor() {
      this.layers = new Set();
      this.addedTo = null;
    }

    addLayer(layer) {
      if (!layer) return;
      this.layers.add(layer);
      layer.parentGroup = this;
    }

    removeLayer(layer) {
      this.layers.delete(layer);
    }

    clearLayers() {
      this.layers.clear();
    }

    addTo(mapLike) {
      this.addedTo = mapLike;
      return this;
    }
  }

  const L = {
    layerGroup() {
      return new FakeLayerGroup();
    },
    divIcon(options) {
      return new FakeDivIcon(options);
    },
    marker(latlng, options) {
      return new FakeMarker(latlng, options);
    },
  };

  let drawCount = 0;

  const glyphLayer = await createLeafletGlyphLayer({
    morpher,
    L,
    geometry: "regular",
    drawGlyph: ({ data, featureId }) => {
      drawCount += 1;
      if (!data) return null;
      const population = data.population ?? 0;
      return {
        html: `<div data-code="${featureId}">${population}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      };
    },
    markerOptions: {
      interactive: false,
    },
  });

  const { layer, getState, updateGlyphs } = glyphLayer;

  assert.ok(layer instanceof FakeLayerGroup);
  assert.ok(layer.layers.size > 0);
  const initialState = getState();
  assert.equal(initialState.geometry, "regular");
  assert.equal(initialState.morphFactor, 0);
  assert.equal(initialState.markerCount, layer.layers.size);
  assert.ok(drawCount > 0);

  const updateResult = updateGlyphs({ geometry: "interpolated", morphFactor: 0.75 });
  assert.equal(updateResult.geometry, "interpolated");
  assert.equal(updateResult.morphFactor, 0.75);
  assert.equal(updateResult.featureCount, layer.layers.size);

  const afterState = getState();
  assert.equal(afterState.geometry, "interpolated");
  assert.equal(afterState.morphFactor, 0.75);
  assert.equal(afterState.markerCount, layer.layers.size);

  glyphLayer.clear();
  assert.equal(layer.layers.size, 0);
});

test("Adapter parity: featureCollection and featureProvider produce same glyph counts", async () => {
  const morpher = new GeoMorpher({ regularGeoJSON, cartogramGeoJSON, data: sampleData, aggregations: { population: 'sum', households: 'sum' } });
  await morpher.prepare();

  const collection = morpher.getRegularFeatureCollection();

  // Reuse our Leaflet fakes
  class FakeLayerGroup { constructor() { this.layers = new Set(); } addLayer(l) { this.layers.add(l); l.parentGroup = this; } removeLayer(l) { this.layers.delete(l); } clearLayers() { this.layers.clear(); } addTo(map){ this.addedTo = map; return this;} }
  class FakeDivIcon { constructor(o){ this.options = o; } }
  class FakeMarker { constructor(latlng, options = {}) { this.latlng = latlng; this.options = options; this.icon = options.icon ?? null; this.parentGroup = null; } addTo(group){ if(group?.addLayer) group.addLayer(this); return this; } remove(){ this.parentGroup?.removeLayer(this); } setLatLng(latlng){ this.latlng = latlng;} setIcon(icon){ this.icon = icon; } }

  const L = { layerGroup(){ return new FakeLayerGroup(); }, divIcon(opts){ return new FakeDivIcon(opts); }, marker(latlng, options){ return new FakeMarker(latlng, options); } };

  const leafletGlyph = await createLeafletGlyphLayer({ morpher, L, geometry: 'regular', drawGlyph: ({ feature }) => ({ html: `<div>${feature.properties.code}</div>` }), featureCollection: collection, markerOptions: { interactive: false } });
  const leafletCount = leafletGlyph.getState().markerCount;

  // Minimal MapLibre-like mocks
  const fakeMap = { markers: new Set(), getZoom(){ return 10; }, project(){ return { x: 0, y: 0 }; } };
  const maplibreNS = {
    Marker: class {
      constructor(opts) {
        this.element = opts.element;
      }
      setLngLat() { return this; }
      addTo(map) { map.markers.add(this); this.addedTo = map; return this; }
      remove() { this.addedTo.markers.delete(this); }
      setOffset() {}
      setRotation() {}
      setPitchAlignment() {}
      setRotationAlignment() {}
    }
  };

  const maplibreGlyph = await createMapLibreGlyphLayer({ morpher, map: fakeMap, drawGlyph: ({ feature }) => ({
    element: { nodeType: 1 } // Minimal element-like object
  }), featureCollection: collection, maplibreNamespace: maplibreNS });
  const maplibreCount = maplibreGlyph.getState().markerCount;

  assert.equal(leafletCount, maplibreCount);

  // Now test featureProvider parity (dynamic provider control)
  const provider = ({ geometry, morphFactor }) => {
    const c = morpher.getInterpolatedFeatureCollection(morphFactor);
    if (morphFactor < 0.5) {
      c.features = c.features.filter((_, i) => i % 2 === 0);
    }
    return c;
  };

  const lf2 = await createLeafletGlyphLayer({ L, drawGlyph: ({ feature }) => ({ html: `<div>${feature.properties.code}</div>` }), featureProvider: provider });
  const ml2 = await createMapLibreGlyphLayer({ map: fakeMap, drawGlyph: ({ feature }) => ({
    element: { nodeType: 1 }
  }), featureProvider: provider, maplibreNamespace: maplibreNS });

  // initial 0 factor
  const lfState0 = lf2.updateGlyphs({ morphFactor: 0 });
  const mlState0 = ml2.updateGlyphs({ morphFactor: 0 });
  assert.equal(lfState0.featureCount, mlState0.featureCount);

  // morphFactor 1 should have full feature set parity
  const lfState1 = lf2.updateGlyphs({ morphFactor: 1 });
  const mlState1 = ml2.updateGlyphs({ morphFactor: 1 });
  assert.equal(lfState1.featureCount, mlState1.featureCount);
});

test("Shared marker adapters produce platform data", async () => {
  const { normalizeRawGlyphResult } = await import("../src/adapters/shared/glyphNormalizer.js");
  const { createLeafletIcon } = await import("../src/adapters/leaflet/index.js");
  const { normalizeForMapLibre } = await import("../src/adapters/shared/markerAdapter.js");

  const sample = { html: '<div class="x">hi</div>', iconSize: [20, 20], iconAnchor: [10, 10] };
  const normalized = normalizeRawGlyphResult({ result: sample });

  // Create Leaflet icon via helper (fake L
  const fakeL = { divIcon: (opts) => ({ opts }) };
  const leafletIcon = createLeafletIcon({ L: fakeL, normalized, pane: 'glyphs' });
  assert.ok(leafletIcon);

  const maplibreData = normalizeForMapLibre({ normalized });
  assert.ok(maplibreData);
  assert.ok(maplibreData.element || maplibreData.markerOptions);
});

test("GeoMorpher supports grid-based cartogram input", async () => {
  const regular = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ID: "REG-1" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { ID: "REG-2" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2, 0],
              [4, 0],
              [4, 2],
              [2, 2],
              [2, 0],
            ],
          ],
        },
      },
    ],
  };

  const gridRecords = [
    { ID: "REG-1", row: 1, col: 1 },
    { ID: "REG-2", row: 1, col: 2 },
  ];

  const generated = createGridCartogramFeatureCollection({
    records: gridRecords,
    regularGeoJSON: regular,
    joinProperty: "ID",
    gridOptions: {
      idField: "ID",
      rowField: "row",
      colField: "col",
      cellPadding: 0,
    },
  });

  assert.equal(generated.features.length, 2);
  assert.equal(generated.features[0].properties.ID, "REG-1");

  const fromArray = new GeoMorpher({
    regularGeoJSON: regular,
    cartogramGeoJSON: gridRecords,
    joinColumn: "ID",
    geoJSONJoinColumn: "ID",
    cartogramGridOptions: {
      idField: "ID",
      rowField: "row",
      colField: "col",
      cellPadding: 0,
    },
  });

  await fromArray.prepare();
  const cartogramArray = fromArray.getCartogramFeatureCollection();
  assert.equal(cartogramArray.features.length, 2);
  assert.equal(cartogramArray.features[0].properties.ID, "REG-1");
  assert.equal(cartogramArray.features[1].geometry.type, "Polygon");

  const csvInput = "ID,row,col\nREG-1,1,1\nREG-2,1,2";
  const fromCsv = new GeoMorpher({
    regularGeoJSON: regular,
    cartogramGeoJSON: csvInput,
    joinColumn: "ID",
    geoJSONJoinColumn: "ID",
    cartogramGridOptions: {
      idField: "ID",
      rowField: "row",
      colField: "col",
      cellPadding: 0,
    },
  });

  await fromCsv.prepare();
  const cartogramCsv = fromCsv.getCartogramFeatureCollection();
  assert.equal(cartogramCsv.features.length, 2);
  assert.equal(cartogramCsv.features[0].geometry.type, "Polygon");
  assert.ok(cartogramCsv.features[0].geometry.coordinates[0].length >= 4);
});
