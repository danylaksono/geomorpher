import maplibregl from "maplibre-gl";
import {
  GeoMorpher,
  createMapLibreMorphLayers,
  createMapLibreGlyphLayer,
} from "../../src/index.js";

const formatStat = (value) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const regularCountEl = document.getElementById("count-regular");
const cartogramCountEl = document.getElementById("count-cartogram");
const basemapToggle = document.getElementById("basemapEffectToggle");
const glyphLegendEl = document.getElementById("glyphLegend");
const regularToggle = document.getElementById("toggle-regular");
const interpolatedToggle = document.getElementById("toggle-interpolated");
const cartogramToggle = document.getElementById("toggle-cartogram");
const glyphToggle = document.getElementById("toggle-glyphs");

const BASE_STYLE = {
  version: 8,
  name: "GeoMorpher Base",
  metadata: {
    "geo-morpher": "maplibre-demo",
  },
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#e2e8f0",
      },
    },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-opacity": 1,
      },
    },
  ],
};

async function fetchJSON(fileName) {
  const url = new URL(`../../data/${fileName}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

const flattenPositions = (geometry) => {
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  if (!coordinates) return [];

  switch (type) {
    case "Point":
      return [coordinates];
    case "MultiPoint":
    case "LineString":
      return coordinates;
    case "MultiLineString":
      return coordinates.flat();
    case "Polygon":
      return coordinates.flat();
    case "MultiPolygon":
      return coordinates.flat(2);
    default:
      return [];
  }
};

function computeBounds(featureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  featureCollection.features.forEach((feature) => {
    const positions = flattenPositions(feature.geometry);
    positions.forEach(([lng, lat]) => {
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        bounds.extend([lng, lat]);
      }
    });
  });
  return bounds;
}

const createPieChartSVG = (slices, { size = 56, stroke = "white" } = {}) => {
  const radius = size / 2;
  const center = radius;

  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  if (!Number.isFinite(total) || total <= 0) {
    return `<svg width="${size}" height="${size}"></svg>`;
  }

  let currentAngle = -Math.PI / 2;
  const segments = slices
    .filter((slice) => Number.isFinite(slice.value) && slice.value > 0)
    .map((slice) => {
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
      return `<path d="${path}" fill="${slice.color}" stroke="${stroke}" stroke-width="1"></path>`;
    });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segments.join("")}</svg>`;
};

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

    const initialFactor = Number(slider.value);
    factorValue.textContent = initialFactor.toFixed(2);
    let currentMorphFactor = initialFactor;
    let basemapEffectEnabled = basemapToggle ? basemapToggle.checked : true;
    let glyphsVisible = glyphToggle ? glyphToggle.checked : true;

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

    const map = new maplibregl.Map({
      container: "map",
      style: BASE_STYLE,
      center: [-1.2577, 51.752],
      zoom: 11.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    const bounds = computeBounds(morpher.getRegularFeatureCollection());

    map.on("load", async () => {
      const morphControls = await createMapLibreMorphLayers({
        morpher,
        map,
        morphFactor: initialFactor,
        idBase: "geomorpher-maplibre",
        regularStyle: {
          paint: {
            "fill-color": "#1f77b4",
            "fill-opacity": 0.18,
            "fill-outline-color": "#1f77b4",
          },
        },
        cartogramStyle: {
          paint: {
            "fill-color": "#ff7f0e",
            "fill-opacity": 0.18,
            "fill-outline-color": "#ff7f0e",
          },
        },
        interpolatedStyle: {
          paint: {
            "fill-color": "#22c55e",
            "fill-opacity": 0.4,
            "fill-outline-color": "#15803d",
          },
        },
        basemapEffect: {
          layers: ["osm"],
          properties: {
            "raster-opacity": [1, 0.1],
            "raster-brightness-max": { from: 1, to: 0.85 },
          },
          propertyClamp: {
            "raster-brightness-max": [0, 1],
          },
          easing: (t) => t * t,
          isEnabled: () => basemapEffectEnabled,
        },
      });

      const glyphControls = await createMapLibreGlyphLayer({
        morpher,
        map,
        morphFactor: initialFactor,
        geometry: "interpolated",
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

          return {
            html: createPieChartSVG(slices, { size: 52 }),
            className: "pie-chart-marker",
            iconSize: [52, 52],
            iconAnchor: [26, 26],
          };
        },
        maplibreNamespace: maplibregl,
      });

      

      const applyLayerVisibility = () => {
        morphControls.setLayerVisibility({
          regular: regularToggle ? regularToggle.checked : true,
          cartogram: cartogramToggle ? cartogramToggle.checked : true,
          interpolated: interpolatedToggle ? interpolatedToggle.checked : true,
        });

        glyphsVisible = glyphToggle ? glyphToggle.checked : true;
        if (glyphsVisible) {
          glyphControls.updateGlyphs({ morphFactor: currentMorphFactor });
        } else {
          glyphControls.clear();
        }
      };

      applyLayerVisibility();

      if (regularToggle) {
        regularToggle.addEventListener("change", applyLayerVisibility);
      }
      if (cartogramToggle) {
        cartogramToggle.addEventListener("change", applyLayerVisibility);
      }
      if (interpolatedToggle) {
        interpolatedToggle.addEventListener("change", applyLayerVisibility);
      }
      if (glyphToggle) {
        glyphToggle.addEventListener("change", applyLayerVisibility);
      }

      regularCountEl.textContent = formatStat(
        morpher.getRegularFeatureCollection().features.length,
      );
      cartogramCountEl.textContent = formatStat(
        morpher.getCartogramFeatureCollection().features.length,
      );

      if (bounds && bounds.isEmpty && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, linear: true, duration: 0 });
      }

      slider.addEventListener("input", (event) => {
        const value = Number(event.target.value);
        factorValue.textContent = value.toFixed(2);
        currentMorphFactor = value;
        morphControls.updateMorphFactor(value);
        if (glyphsVisible) {
          glyphControls.updateGlyphs({ morphFactor: value });
          // Ensure immediate visual update of DOM markers during drag
          map.triggerRepaint?.();
        }
      });

      if (basemapToggle) {
        basemapToggle.addEventListener("change", (event) => {
          basemapEffectEnabled = event.target.checked;
          morphControls.updateMorphFactor(currentMorphFactor);
        });
      }

      statusEl.textContent = "Ready";
    });
  } catch (error) {
    console.error(error);
    if (statusEl) {
      statusEl.textContent = "Something went wrong";
    }
  }
}

bootstrap();


