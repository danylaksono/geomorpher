import maplibregl from "maplibre-gl";
import { GeoMorpher, WGS84Projection, createMapLibreMorphLayers } from "../../../src/index.js";

const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const scenarioSelect = document.getElementById("scenario");

const BASE_STYLE = {
  version: 8,
  name: "Projections Demo",
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e2e8f0" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 1 } },
  ],
};

function makeRectFeature([minLng, minLat, maxLng, maxLat], props) {
  return {
    type: "Feature",
    properties: props ?? {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minLng, minLat], [minLng, maxLat], [maxLng, maxLat], [maxLng, minLat], [minLng, minLat],
      ]],
    },
  };
}

function createSyntheticWGS84() {
  const regular = {
    type: "FeatureCollection",
    features: [makeRectFeature([-123.5, 37.0, -121.5, 38.2], { code: "A", population: 1000 })],
  };
  const cartogram = {
    type: "FeatureCollection",
    features: [makeRectFeature([-123.5, 36.7, -120.7, 38.6], { code: "A", population: 1000 })],
  };
  return { regular, cartogram };
}

function createSyntheticUTM() {
  // Simplified UTM-like planar coordinates (meters)
  const regular = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "AREA-1", population: 50000 },
        geometry: { type: "Polygon", coordinates: [[ [500000, 6000000], [600000, 6000000], [600000, 6100000], [500000, 6100000], [500000, 6000000] ]] },
      },
    ],
  };
  const cartogram = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "AREA-1", population: 50000 },
        geometry: { type: "Polygon", coordinates: [[ [500000, 6000000], [650000, 6000000], [650000, 6150000], [500000, 6150000], [500000, 6000000] ]] },
      },
    ],
  };

  // Crude projection adapter (demo only)
  const UTM33NProjection = {
    toGeo: ([easting, northing]) => {
      const centralMeridian = 15; // degrees
      const falseEasting = 500000;
      const falseNorthing = 0;
      const x = (easting - falseEasting) / 1000000;
      const y = (northing - falseNorthing) / 1000000;
      const lng = centralMeridian + x * 6;
      const lat = (y * 90) / 10;
      return [lng, lat];
    },
    name: "UTM Zone 33N (Approximation)",
  };

  return { regular, cartogram, projection: UTM33NProjection };
}

async function runScenario(scenario) {
  const map = new maplibregl.Map({ container: "map", style: BASE_STYLE, center: [-122.5, 37.8], zoom: 7.5, attributionControl: false });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

  const initialFactor = Number(slider.value);
  factorValue.textContent = initialFactor.toFixed(2);

  let dataset;
  if (scenario === "utm33n") {
    dataset = createSyntheticUTM();
  } else {
    dataset = createSyntheticWGS84();
  }

  const morpher = new GeoMorpher({
    regularGeoJSON: dataset.regular,
    cartogramGeoJSON: dataset.cartogram,
    projection: dataset.projection ?? WGS84Projection,
    geoJSONJoinColumn: "code",
  });

  await morpher.prepare();

  map.on("load", async () => {
    const ctl = await createMapLibreMorphLayers({
      morpher,
      map,
      morphFactor: initialFactor,
      idBase: "geomorpher-projection",
      regularStyle: { paint: { "fill-color": "#334155", "fill-opacity": 0.28, "fill-outline-color": "#0f172a" } },
      cartogramStyle: { paint: { "fill-color": "#7c3aed", "fill-opacity": 0.22, "fill-outline-color": "#6d28d9" } },
      interpolatedStyle: { paint: { "fill-color": "#16a34a", "fill-opacity": 0.45, "fill-outline-color": "#047857" } },
      basemapEffect: { layers: ["osm"], properties: { "raster-opacity": [1, 0.12] } },
    });

    slider.addEventListener("input", (e) => {
      const value = Number(e.target.value);
      factorValue.textContent = value.toFixed(2);
      ctl.updateMorphFactor(value);
    });
  });
}

async function bootstrap() {
  try {
    statusEl.textContent = "Loading…";
    await runScenario(scenarioSelect.value);
    statusEl.textContent = "Ready";

    scenarioSelect.addEventListener("change", () => {
      const container = document.getElementById("map");
      while (container.firstChild) container.removeChild(container.firstChild);
      runScenario(scenarioSelect.value);
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Something went wrong";
  }
}

bootstrap();



