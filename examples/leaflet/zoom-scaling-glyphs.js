import L from "npm:leaflet";
import {
  GeoMorpher,
  createLeafletMorphLayers,
  createLeafletGlyphLayer,
} from "../../src/index.js";

const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const scaleToggle = document.getElementById("scaleToggle");

async function fetchJSON(fileName) {
  const url = new URL(`../../data/${fileName}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

function createWaffleChart(data, width, height) {
  const gridSize = 10;
  const padding = 2;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const cellSize = Math.min(availableWidth, availableHeight) / gridSize;

  const maxPopulation = 5000;
  const population = Number(data?.population ?? 0);
  const fillRatio = Math.min(population / maxPopulation, 1);
  const filledCells = Math.floor(gridSize * gridSize * fillRatio);

  const cells = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const index = i * gridSize + j;
      const filled = index < filledCells;
      const x = padding + j * cellSize;
      const y = padding + i * cellSize;
      cells.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellSize - 1).toFixed(1)}" height="${(cellSize - 1).toFixed(1)}" fill="${filled ? "#4e79a7" : "#e0e0e0"}" stroke="white" stroke-width="0.5"/>`
      );
    }
  }

  return `<svg width="${width}" height="${height}" class="waffle-glyph">${cells.join("")}</svg>`;
}

function createFixedWaffleChart(data) {
  return createWaffleChart(data, 60, 60);
}

async function bootstrap() {
  try {
    statusEl.textContent = "Loading data…";

    const [regularGeoJSON, cartogramGeoJSON] = await Promise.all([
      fetchJSON("oxford_lsoas_regular.json"),
      fetchJSON("oxford_lsoas_cartogram.json"),
    ]);

    const aggregations = { population: "sum", households: "sum" };

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

    const glyphPane = map.createPane("glyphs");
    glyphPane.style.zIndex = 650;
    glyphPane.style.pointerEvents = "none";

    const basemapLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const initialFactor = Number(slider.value);
    factorValue.textContent = initialFactor.toFixed(2);
    let currentMorphFactor = initialFactor;
    let scaleWithZoomEnabled = scaleToggle.checked;

    const { group, regularLayer, tweenLayer, cartogramLayer, updateMorphFactor } =
      await createLeafletMorphLayers({
        morpher,
        L,
        morphFactor: initialFactor,
        regularStyle: () => ({ color: "#1f77b4", weight: 1, fillOpacity: 0.15 }),
        cartogramStyle: () => ({ color: "#ff7f0e", weight: 1, fillOpacity: 0.15 }),
        tweenStyle: () => ({ color: "#22c55e", weight: 2, fillOpacity: 0 }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(
            `<strong>LSOA ${feature.properties.code}</strong><br/>Population: ${feature.properties.population ?? "N/A"}`
          );
        },
        basemapLayer,
        basemapEffect: {
          blurRange: [0, 10],
          opacityRange: [1, 0.1],
          grayscaleRange: [0, 1],
        },
      });

    group.addTo(map);

    let glyphControls = await createLeafletGlyphLayer({
      morpher,
      L,
      map,
      geometry: "interpolated",
      morphFactor: initialFactor,
      pane: "glyphs",
      scaleWithZoom: scaleWithZoomEnabled,
      drawGlyph: ({ data, feature, featureBounds }) => {
        const properties = data?.data?.properties ?? feature.properties ?? {};

        if (scaleWithZoomEnabled && featureBounds) {
          const { width, height } = featureBounds;
          if (width < 20 || height < 20) return null;
          return {
            html: createWaffleChart(properties, width, height),
            iconSize: [width, height],
            iconAnchor: [width / 2, height / 2],
            className: "waffle-marker",
          };
        } else {
          return {
            html: createFixedWaffleChart(properties),
            iconSize: [60, 60],
            iconAnchor: [30, 30],
            className: "waffle-marker",
          };
        }
      },
    });

    const glyphLayer = glyphControls.layer;

    const overlays = {
      "Regular geography": regularLayer,
      "Tween morph": tweenLayer,
      "Cartogram geography": cartogramLayer,
      "Waffle glyphs": glyphLayer,
    };

    L.control
      .layers(null, overlays, {
        collapsed: window.matchMedia("(max-width: 768px)").matches,
      })
      .addTo(map);

    map.fitBounds(regularLayer.getBounds(), { padding: [20, 20] });

    slider.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      factorValue.textContent = value.toFixed(2);
      currentMorphFactor = value;
      updateMorphFactor(value);
      glyphControls.updateGlyphs({ morphFactor: value });
    });

    scaleToggle.addEventListener("change", async (event) => {
      scaleWithZoomEnabled = event.target.checked;
      statusEl.textContent = "Recreating glyph layer...";
      glyphControls.destroy();
      map.removeLayer(glyphLayer);

      glyphControls = await createLeafletGlyphLayer({
        morpher,
        L,
        map,
        geometry: "interpolated",
        morphFactor: currentMorphFactor,
        pane: "glyphs",
        scaleWithZoom: scaleWithZoomEnabled,
        drawGlyph: ({ data, feature, featureBounds }) => {
          const properties = data?.data?.properties ?? feature.properties ?? {};
          if (scaleWithZoomEnabled && featureBounds) {
            const { width, height } = featureBounds;
            if (width < 20 || height < 20) return null;
            return {
              html: createWaffleChart(properties, width, height),
              iconSize: [width, height],
              iconAnchor: [width / 2, height / 2],
              className: "waffle-marker",
            };
          } else {
            return {
              html: createFixedWaffleChart(properties),
              iconSize: [60, 60],
              iconAnchor: [30, 30],
              className: "waffle-marker",
            };
          }
        },
      });

      glyphControls.layer.addTo(map);
      statusEl.textContent = scaleWithZoomEnabled ? "Zoom-scaling enabled" : "Fixed-size mode";
    });

    map.on("zoomend", () => {
      const state = glyphControls.getState();
      console.log(`Zoom: ${map.getZoom()}, Markers: ${state.markerCount}`);
    });

    statusEl.textContent = scaleWithZoomEnabled ? "Zoom-scaling enabled" : "Fixed-size mode";
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error loading demo";
  }
}

bootstrap();


