import maplibregl from "maplibre-gl";
import { GeoMorpher, createMapLibreMorphLayers, WGS84Projection } from "../../src/index.js";
import { flattenPositions } from "../../src/adapters/shared/geometry.js";
import * as turf from "@turf/turf";

const statusEl = document.getElementById("status");

const layerDefinitions = {
  lsoa: {
    label: "LSOA",
    color: "#1f77b4",
    interpolatedColor: "#60a5fa",
    idBase: "winchester-lsoa",
    sliderId: "morphFactor-lsoa",
    valueId: "factorValue-lsoa",
    morphToggleId: "toggle-lsoa-morph",
    circleToggleId: "toggle-circles-lsoa",
    countId: "count-lsoa",
    circleSource: "areas-lsoa",
    circleLayer: "areas-lsoa-circles",
  },
  msoa: {
    label: "MSOA",
    color: "#f28e2c",
    interpolatedColor: "#fb923c",
    idBase: "winchester-msoa",
    sliderId: "morphFactor-msoa",
    valueId: "factorValue-msoa",
    morphToggleId: "toggle-msoa-morph",
    circleToggleId: "toggle-circles-msoa",
    countId: "count-msoa",
    circleSource: "areas-msoa",
    circleLayer: "areas-msoa-circles",
  },
  ward: {
    label: "Ward",
    color: "#22c55e",
    interpolatedColor: "#86efac",
    idBase: "winchester-ward",
    sliderId: "morphFactor-ward",
    valueId: "factorValue-ward",
    morphToggleId: "toggle-ward-morph",
    circleToggleId: "toggle-circles-ward",
    countId: "count-ward",
    circleSource: "areas-ward",
    circleLayer: "areas-ward-circles",
  },
};

const layerStates = Object.entries(layerDefinitions).map(([key, definition]) => ({
  key,
  ...definition,
  sliderEl: document.getElementById(definition.sliderId),
  valueEl: document.getElementById(definition.valueId),
  morphToggleEl: document.getElementById(definition.morphToggleId),
  circleToggleEl: document.getElementById(definition.circleToggleId),
  countEl: document.getElementById(definition.countId),
  controller: null,
  pointCollection: null,
}));

function formatStat(value) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function fetchJSON(fileName) {
  const url = new URL(`../../data/winchester/${fileName}`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${fileName}: ${res.status}`);
  return res.json();
}

function computeBounds(featureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  featureCollection.features.forEach((feature) => {
    const positions = flattenPositions(feature.geometry);
    positions.forEach(([lng, lat]) => {
      if (Number.isFinite(lng) && Number.isFinite(lat)) bounds.extend([lng, lat]);
    });
  });
  return bounds;
}

function computeCentroidFromPositions(feature) {
  const positions = flattenPositions(feature.geometry || feature);
  let sumX = 0,
    sumY = 0,
    count = 0;
  for (const p of positions) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sumX += x;
    sumY += y;
    count += 1;
  }
  if (count === 0) return null;
  const cx = sumX / count;
  const cy = sumY / count;
  if (Math.abs(cx) > 90 && Math.abs(cy) <= 90) {
    return [cy, cx];
  }
  return [cx, cy];
}

function createAreaPoint(feature) {
  const areaVal = turf.area(feature);
  const centroid = computeCentroidFromPositions(feature);
  if (!centroid || !Number.isFinite(areaVal)) return null;
  const [lng, lat] = centroid;
  // Reduce area circle sizes for clearer display in the example.
  // Use a larger divisor and slightly smaller max/min to avoid overwhelming the map.
  const radius = Math.max(0.8, Math.min(8, Math.sqrt(areaVal) / 600));
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      area: areaVal,
      radius,
      id: feature.id ?? feature.properties?.code ?? null,
    },
  };
}

// build a point collection from either the regular or interpolated features
function createAreaCollection(morpher, factor = 0) {
  const fc = factor === 0 ? morpher.getRegularFeatureCollection() : morpher.getInterpolatedFeatureCollection(factor);
  return {
    type: "FeatureCollection",
    features: fc.features.map(createAreaPoint).filter(Boolean),
  };
}

const BASE_STYLE = {
  version: 8,
  name: "GeoMorpher Winchester",
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0b1220" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.92 } },
  ],
};

let map;

function updateSliderLabel(state, value) {
  if (state.valueEl) state.valueEl.textContent = value.toFixed(2);
}

function applyVisibility(state) {
  if (!state.controller) return;
  const visible = state.morphToggleEl?.checked ?? true;
  state.controller.setLayerVisibility({
    regular: visible,
    cartogram: visible,
    interpolated: visible,
  });

  if (map?.getLayer(state.circleLayer)) {
    const circleVisible = state.circleToggleEl?.checked ? "visible" : "none";
    map.setLayoutProperty(state.circleLayer, "visibility", circleVisible);
  }
}

async function bootstrap() {
  try {
    if (statusEl) statusEl.textContent = "Loading Winchester data…";

    const [lsoaReg, lsoaCart, msoaReg, msoaCart, wardReg, wardCart] = await Promise.all([
      fetchJSON("winchester_lsoa_geo.geojson"),
      fetchJSON("winchester_lsoa_cartogram.geojson"),
      fetchJSON("winchester_msoa_geo.geojson"),
      fetchJSON("winchester_msoa_cartogram.geojson"),
      fetchJSON("winchester_ward_geo.geojson"),
      fetchJSON("winchester_ward_cartogram.geojson"),
    ]);

    // both regular and cartogram collections lack a common "code" property,
    // so attach one to make the morphers able to align the features. regular
    // sources include a numeric FID and a string LSOA21CD; cartogram tiles only
    // report the FID inside a names array. we pick the numeric FID on both
    // sides so IDs match exactly.
    const patchJoin = (reg, cart) => {
      reg.features.forEach((f) => {
        if (!f.properties) f.properties = {};
        // use FID when available, otherwise fall back to the text code
        f.properties.code = f.properties.FID ?? f.properties.LSOA21CD ?? f.properties.code;
      });
      cart.features.forEach((f) => {
        if (!f.properties) f.properties = {};
        if (Array.isArray(f.properties.names) && f.properties.names.length) {
          f.properties.code = f.properties.names[0];
        }
      });
    };

    patchJoin(lsoaReg, lsoaCart);
    patchJoin(msoaReg, msoaCart);
    patchJoin(wardReg, wardCart);

    const morphers = {
      lsoa: new GeoMorpher({ regularGeoJSON: lsoaReg, cartogramGeoJSON: lsoaCart, projection: WGS84Projection }),
      msoa: new GeoMorpher({ regularGeoJSON: msoaReg, cartogramGeoJSON: msoaCart, projection: WGS84Projection }),
      ward: new GeoMorpher({ regularGeoJSON: wardReg, cartogramGeoJSON: wardCart, projection: WGS84Projection }),
    };

    await Promise.all(Object.values(morphers).map((morpher) => morpher.prepare()));

    layerStates.forEach((state) => {
      const morpher = morphers[state.key];
      if (!morpher) return;
      const count = morpher.getRegularFeatureCollection().features.length;
      if (state.countEl) state.countEl.textContent = formatStat(count);
      const initialFactor = Number(state.sliderEl?.value ?? 0);
      state.pointCollection = createAreaCollection(morpher, initialFactor);
      updateSliderLabel(state, initialFactor);
    });

    const bounds = computeBounds(morphers.lsoa.getRegularFeatureCollection());

    map = new maplibregl.Map({
      container: "map",
      style: BASE_STYLE,
      center: bounds.getCenter?.() ?? [-1.3, 51.06],
      zoom: 11.2,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      await Promise.all(
        layerStates.map(async (state) => {
          const morpher = morphers[state.key];
          if (!morpher) return;
          const color = state.color;
          const interpolated = state.interpolatedColor;
          const initialFactor = Number(state.sliderEl?.value ?? 0);
          state.controller = await createMapLibreMorphLayers({
            morpher,
            map,
            morphFactor: initialFactor,
            idBase: state.idBase,
            regularStyle: { paint: { "fill-color": color, "fill-opacity": 0.18, "fill-outline-color": color } },
            cartogramStyle: { paint: { "fill-color": color, "fill-opacity": 0.18 } },
            interpolatedStyle: { paint: { "fill-color": interpolated, "fill-opacity": 0.32 } },
          });

          if (state.pointCollection) {
            map.addSource(state.circleSource, { type: "geojson", data: state.pointCollection });
            map.addLayer({
              id: state.circleLayer,
              type: "circle",
              source: state.circleSource,
              paint: {
                "circle-radius": ["get", "radius"],
                "circle-color": color,
                "circle-opacity": 0.85,
                "circle-stroke-color": "white",
                "circle-stroke-width": 1,
              },
            });
          }
        })
      );

      // allow optionally linking sliders across layers
      const linkSlidersEl = document.getElementById("link-sliders");

      layerStates.forEach((state) => {
        state.morphToggleEl?.addEventListener("change", () => applyVisibility(state));
        state.circleToggleEl?.addEventListener("change", () => applyVisibility(state));
        state.sliderEl?.addEventListener("input", (evt) => {
          const value = Number(evt.target.value);
          if (!Number.isFinite(value)) return;

          if (linkSlidersEl?.checked) {
            // apply same value to all layer controllers and update UI
            layerStates.forEach((s) => {
              if (s.sliderEl) s.sliderEl.value = value;
              updateSliderLabel(s, value);
              s.controller?.updateMorphFactor(value);
              // update circles based on new factor
              const morpher = morphers[s.key];
              if (morpher && map.getSource(s.circleSource)) {
                map.getSource(s.circleSource).setData(createAreaCollection(morpher, value));
              }
            });
          } else {
            updateSliderLabel(state, value);
            state.controller?.updateMorphFactor(value);
            const morpher = morphers[state.key];
            if (morpher && map.getSource(state.circleSource)) {
              map.getSource(state.circleSource).setData(createAreaCollection(morpher, value));
            }
          }

          map.triggerRepaint?.();
        });
        applyVisibility(state);
      });

      // Test button to quickly set all layers to 50% morph for verification
      const testBtn = document.getElementById("test-morph");
      testBtn?.addEventListener("click", () => {
        const testValue = 0.5;
        layerStates.forEach((s) => {
          if (s.sliderEl) s.sliderEl.value = testValue;
          updateSliderLabel(s, testValue);
          s.controller?.updateMorphFactor(testValue);
          const morpher = morphers[s.key];
          if (morpher && map.getSource(s.circleSource)) {
            map.getSource(s.circleSource).setData(createAreaCollection(morpher, testValue));
          }
        });
        if (statusEl) statusEl.textContent = `Test: all layers ${testValue.toFixed(2)}`;
        map.triggerRepaint?.();
      });

      if (bounds && typeof bounds.isEmpty === "function" && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, linear: true, duration: 0 });
      }

      if (statusEl) statusEl.textContent = "Ready";
    });
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "Something went wrong";
  }
}

bootstrap();
