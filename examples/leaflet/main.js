import L from "npm:leaflet";
import {
  GeoMorpher,
  createLeafletMorphLayers,
  createLeafletGlyphLayer,
} from "../../src/index.js";

const formatStat = (value) => value.toLocaleString(undefined, {
  maximumFractionDigits: 0,
});

const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const regularCountEl = document.getElementById("count-regular");
const cartogramCountEl = document.getElementById("count-cartogram");
const basemapToggle = document.getElementById("basemapBlurToggle");
const glyphLegendEl = document.getElementById("glyphLegend");

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
    let basemapEffectEnabled = basemapToggle ? basemapToggle.checked : true;

    const categories = [
      { key: "population", label: "Population", color: "#4e79a7" },
      { key: "households", label: "Households", color: "#f28e2c" },
    ];

    if (glyphLegendEl) {
      glyphLegendEl.innerHTML = "";
      for (const { key, label, color } of categories) {
        const item = document.createElement("li");
        item.className = "legend-item";
        item.innerHTML = `
          <span class="legend-swatch" style="background: ${color}"></span>
          <span>${label} <small style="color: #94a3b8; font-size: 0.8rem;">(${key})</small></span>
        `;
        glyphLegendEl.appendChild(item);
      }
    }

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

    const glyphControls = await createLeafletGlyphLayer({
      morpher,
      L,
      map,
      geometry: "interpolated",
      morphFactor: initialFactor,
      pane: "glyphs",
      drawGlyph: ({ data, feature }) => {
        const properties = data?.data?.properties ?? feature.properties ?? {};
        const slices = categories
          .map(({ key, color }) => ({
            key,
            color,
            value: Number(properties?.[key] ?? 0),
          }))
          .filter((slice) => slice.value > 0);

        if (slices.length === 0) {
          return null;
        }

        const radius = 26;
        const size = 52;
        const center = radius;
        let currentAngle = -Math.PI / 2;
        const total = slices.reduce((sum, s) => sum + s.value, 0);
        const segments = slices.map((slice) => {
          const angle = (slice.value / total) * Math.PI * 2;
          const endAngle = currentAngle + angle;
          const largeArc = angle > Math.PI ? 1 : 0;
          const startX = center + radius * Math.cos(currentAngle);
          const startY = center + radius * Math.sin(currentAngle);
          const endX = center + radius * Math.cos(endAngle);
          const endY = center + radius * Math.sin(endAngle);
          const path = [
            `M ${center} ${center}`,
            `L ${startX.toFixed(2)} ${startY.toFixed(2)}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`,
            "Z",
          ].join(" ");
          currentAngle = endAngle;
          return `<path d="${path}" fill="${slice.color}" stroke="white" stroke-width="1"></path>`;
        });

        return {
          html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segments.join("")}</svg>`,
          className: "pie-chart-marker",
          iconSize: [size, size],
          iconAnchor: [radius, radius],
        };
      },
    });

    const glyphLayer = glyphControls.layer;

    const overlays = {
      "Regular geography": regularLayer,
      "Tween morph": tweenLayer,
      "Cartogram geography": cartogramLayer,
      "Pie glyphs": glyphLayer,
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
      glyphControls.updateGlyphs({ morphFactor: value });
    });

    if (basemapToggle) {
      basemapToggle.addEventListener("change", (event) => {
        basemapEffectEnabled = event.target.checked;
        updateMorphFactor(currentMorphFactor);
        glyphControls.updateGlyphs({ morphFactor: currentMorphFactor });
      });
    }

    statusEl.textContent = "Ready";
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Something went wrong";
  }
}

bootstrap();


