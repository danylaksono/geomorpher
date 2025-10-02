import L from "npm:leaflet";
import { GeoMorpher, createLeafletMorphLayers } from "../../src/index.js";

const formatStat = (value) => value.toLocaleString(undefined, {
  maximumFractionDigits: 0,
});

const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const regularCountEl = document.getElementById("count-regular");
const cartogramCountEl = document.getElementById("count-cartogram");
const basemapToggle = document.getElementById("basemapBlurToggle");

async function fetchJSON(fileName) {
  const url = new URL(`../../data/${fileName}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  try {
    statusEl.textContent = "Loading data…";

    const [regularGeoJSON, cartogramGeoJSON] = await Promise.all([
      fetchJSON("oxford_lsoas_regular.json"),
      fetchJSON("oxford_lsoas_cartogram.json"),
    ]);

    const aggregations = {
      population: "sum",
      households: "sum",
    };

    const sampleData = regularGeoJSON.features.map((feature) => ({
      lsoa: feature.properties.code,
      population: Number(feature.properties.population ?? 0),
      households: Number(feature.properties.households ?? 0),
    }));

    const morpher = new GeoMorpher({
      regularGeoJSON,
      cartogramGeoJSON,
      data: sampleData,
      aggregations,
    });

    await morpher.prepare();

    const map = L.map("map", { preferCanvas: true });
    map.setView([51.752, -1.2577], 12);

    const basemapLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const initialFactor = Number(slider.value);
    factorValue.textContent = initialFactor.toFixed(2);
    let currentMorphFactor = initialFactor;
    let basemapEffectEnabled = basemapToggle ? basemapToggle.checked : true;

    const { group, regularLayer, tweenLayer, cartogramLayer, updateMorphFactor } =
      await createLeafletMorphLayers({
        morpher,
        L,
        morphFactor: initialFactor,
        regularStyle: () => ({ color: "#1f77b4", weight: 1, fillOpacity: 0.15 }),
        cartogramStyle: () => ({ color: "#ff7f0e", weight: 1, fillOpacity: 0.15 }),
        tweenStyle: () => ({ color: "#22c55e", weight: 2, fillOpacity: 0 }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(`LSOA ${feature.properties.code}`);
        },
        basemapLayer,
        basemapEffect: {
          blurRange: [0, 14],
          opacityRange: [1, 0.05],
          grayscaleRange: [0, 1],
          isEnabled: () => basemapEffectEnabled,
        },
      });

    group.addTo(map);

    const overlays = {
      "Regular geography": regularLayer,
      "Tween morph": tweenLayer,
      "Cartogram geography": cartogramLayer,
    };

    L.control.layers(null, overlays, {
      collapsed: window.matchMedia("(max-width: 768px)").matches,
    }).addTo(map);

    map.fitBounds(regularLayer.getBounds(), { padding: [20, 20] });

    regularCountEl.textContent = formatStat(
      morpher.getRegularFeatureCollection().features.length
    );
    cartogramCountEl.textContent = formatStat(
      morpher.getCartogramFeatureCollection().features.length
    );

    slider.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      factorValue.textContent = value.toFixed(2);
      currentMorphFactor = value;
      updateMorphFactor(value);
    });

    if (basemapToggle) {
      basemapToggle.addEventListener("change", (event) => {
        basemapEffectEnabled = event.target.checked;
        updateMorphFactor(currentMorphFactor);
      });
    }

    statusEl.textContent = "Ready";
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Something went wrong";
  }
}

bootstrap();
