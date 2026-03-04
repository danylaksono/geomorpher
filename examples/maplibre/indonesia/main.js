import maplibregl from "maplibre-gl";
import {
  GeoMorpher,
  createMapLibreMorphLayers,
  createMapLibreCustomGlyphLayer,
  parseCSV,
  WGS84Projection,
} from "../../../src/index.js";
import { flattenPositions } from "../../../src/adapters/shared/geometry.js";

const metrics = [
  {
    key: "Indeks Pembangunan Literasi Masyarakat",
    label: "Literacy Index",
    color: "#2563eb",
    normalize: (value) => clamp(value / 100),
    format: (value) => `${value.toFixed(2)} pts`,
  },
  {
    key: "Pemerataan Layanan Perpustakaan",
    label: "Library Access",
    color: "#0ea5e9",
    normalize: (value) => clamp(value),
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "Ketercukupan Koleksi Perpustakaan",
    label: "Collection Sufficiency",
    color: "#f59e0b",
    normalize: (value) => clamp(value),
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "Rasio Ketercukupan Tenaga Perpustakaan",
    label: "Staff Adequacy",
    color: "#ef4444",
    normalize: (value) => clamp(value),
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "Tingkat Kunjungan Masyarakat per hari",
    label: "Daily Visits",
    color: "#8b5cf6",
    normalize: (value) => clamp(value),
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
];

const BASE_STYLE = {
  version: 8,
  name: "Indonesia Literacy",
  metadata: {
    "geo-morpher": "maplibre-demo-indonesia",
  },
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0f172a",
      },
    },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-opacity": 0.3,
        "raster-brightness-max": 0.7,
        "raster-saturation": -0.5,
      },
    },
  ],
};

const clamp = (value, min = 0, max = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  if (numeric <= min) return min;
  if (numeric >= max) return max;
  return numeric;
};

const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const basemapToggle = document.getElementById("basemapEffectToggle");
const regularCountEl = document.getElementById("count-regular");
const cartogramCountEl = document.getElementById("count-cartogram");
const glyphLegendEl = document.getElementById("glyphLegend");
const regularToggle = document.getElementById("toggle-regular");
const interpolatedToggle = document.getElementById("toggle-interpolated");
const cartogramToggle = document.getElementById("toggle-cartogram");
const glyphToggle = document.getElementById("toggle-glyphs");

async function fetchJSON(fileName) {
  const response = await fetch(new URL(`../../../data/${fileName}`, import.meta.url));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

async function fetchText(fileName) {
  const response = await fetch(new URL(`../../../data/${fileName}`, import.meta.url));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.text();
}


function computeBounds(featureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  featureCollection.features.forEach((feature) => {
    flattenPositions(feature.geometry).forEach(([lng, lat]) => {
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        bounds.extend([lng, lat]);
      }
    });
  });
  return bounds;
}

function buildLegend() {
  if (!glyphLegendEl) return;
  glyphLegendEl.innerHTML = "";
  metrics.forEach((metric) => {
    const item = document.createElement("li");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-swatch" style="background:${metric.color}"></span>
      <span>${metric.label}</span>
    `;
    glyphLegendEl.appendChild(item);
  });
}

function createRoseChartGlyph({ data, feature }) {
  // `data` typically comes from morpher.getKeyData(), which returns an object
  // like `{ code, population, data }`. the inner `data` holds the enriched
  // GeoJSON feature. fallback to `feature.properties` in case we are using a
  // custom provider or the structure is already a feature.
  if (!data) return null;
  const properties =
    // wrapped feature from getKeyData
    data?.data?.properties ??
    // sometimes the caller passes the feature directly
    data?.properties ??
    // last-resort fallback
    feature?.properties ?? {};

  return {
    size: 48,
    shape: "custom",
    customRender: (ctx, x, y, size) => {
      const radius = size / 2;
      const centerRadius = 4;
      const barWidth = 8;
      const spikes = metrics.length;
      const angleStep = (Math.PI * 2) / spikes;

      // Draw background circle
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw grid circles
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 3; i++) {
        const r = (radius / 3) * i;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw bars for each metric
      metrics.forEach((metric, i) => {
        const rawValue = Number(properties[metric.key] ?? 0);
        const normalized = metric.normalize(rawValue);
        const barHeight = normalized * (radius - centerRadius - 2);

        const angle = angleStep * i - Math.PI / 2;
        const startX = x + Math.cos(angle) * centerRadius;
        const startY = y + Math.sin(angle) * centerRadius;
        const endX = x + Math.cos(angle) * (centerRadius + barHeight);
        const endY = y + Math.sin(angle) * (centerRadius + barHeight);

        // Draw bar line
        ctx.strokeStyle = metric.color;
        ctx.lineWidth = barWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      });

      // Draw center circle
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(x, y, centerRadius + 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(15, 23, 42, 0.2)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    },
  };
}

function normalizeLiteracyRecords(records) {
  const numericKeys = new Set(metrics.map((metric) => metric.key));
  return records.map((record) => {
    const normalized = { ...record };
    numericKeys.forEach((key) => {
      if (key in normalized) {
        const value = Number(normalized[key]);
        normalized[key] = Number.isFinite(value) ? value : 0;
      }
    });
    return normalized;
  });
}

async function bootstrap() {
  try {
    statusEl.textContent = "Loading data…";

    const [regularGeoJSON, cartogramCSV, literacyCSV] = await Promise.all([
      fetchJSON("indonesia/indonesia_provice_boundary.geojson"),
      fetchText("indonesia/indonesia-grid.csv"),
      fetchText("indonesia/literasi_2024.csv"),
    ]);

    const literacyRecords = normalizeLiteracyRecords(parseCSV(literacyCSV));

    const aggregations = metrics.reduce((acc, metric) => {
      acc[metric.key] = "mean";
      return acc;
    }, {});

    const morpher = new GeoMorpher({
      regularGeoJSON,
      cartogramGeoJSON: cartogramCSV,
      data: literacyRecords,
      joinColumn: "ID",
      geoJSONJoinColumn: "id",
      aggregations,
      normalize: false,
      projection: WGS84Projection,
      cartogramGridOptions: {
        idField: "ID",
        rowField: "row",
        colField: "col",
        cellPadding: 0.08,
        rowOrientation: "top",
        colOrientation: "left",
      },
    });

    await morpher.prepare();

    const initialFactor = Number(slider.value);
    factorValue.textContent = initialFactor.toFixed(2);

    buildLegend();

    const map = new maplibregl.Map({
      container: "map",
      style: BASE_STYLE,
      center: [117.5, -2.5],
      zoom: 4.2,
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
        idBase: "geomorpher-indonesia",
        regularStyle: {
          paint: {
            "fill-color": "#06b6d4",
            "fill-opacity": 0.25,
            "fill-outline-color": "#0891b2",
          },
        },
        cartogramStyle: {
          paint: {
            "fill-color": "#8b5cf6",
            "fill-opacity": 0.25,
            "fill-outline-color": "#7c3aed",
          },
        },
        interpolatedStyle: {
          paint: {
            "fill-color": "#10b981",
            "fill-opacity": 0.35,
            "fill-outline-color": "#059669",
          },
        },
        basemapEffect: {
          layers: ["osm"],
          properties: {
            "raster-opacity": [0.3, 0.08],
            "raster-brightness-max": [0.7, 0.5],
            "raster-saturation": [-0.5, -0.8],
          },
          propertyClamp: {
            "raster-brightness-max": [0, 1],
            "raster-opacity": [0, 1],
          },
          easing: (t) => t * t,
          isEnabled: () => (basemapToggle ? basemapToggle.checked : true),
        },
      });

      const glyphControls = await createMapLibreCustomGlyphLayer({
        morpher,
        map,
        morphFactor: initialFactor,
        geometry: "interpolated",
        drawGlyph: ({ feature, featureId, data }) => {
          // data is the enriched feature from GeoMorpher with CSV properties merged
          if (!data) {
            return null;
          }

          return createRoseChartGlyph({
            data,
            feature,
          });
        },
        glyphOptions: {
          size: 48,
        },
      });

      const applyLayerVisibility = () => {
        morphControls.setLayerVisibility({
          regular: regularToggle ? regularToggle.checked : true,
          cartogram: cartogramToggle ? cartogramToggle.checked : true,
          interpolated: interpolatedToggle ? interpolatedToggle.checked : true,
        });

        if (glyphToggle && !glyphToggle.checked) {
          glyphControls.clear();
        } else {
          glyphControls.updateGlyphs({ morphFactor: Number(slider.value) });
        }
      };

      applyLayerVisibility();

      [regularToggle, cartogramToggle, interpolatedToggle, glyphToggle]
        .filter(Boolean)
        .forEach((input) => input.addEventListener("change", applyLayerVisibility));

      regularCountEl.textContent = morpher.getRegularFeatureCollection().features.length.toString();
      cartogramCountEl.textContent = morpher.getCartogramFeatureCollection().features.length.toString();

      if (bounds && typeof bounds.isEmpty === "function" && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, linear: true, duration: 0 });
      }

      slider.addEventListener("input", (event) => {
        const value = Number(event.target.value);
        factorValue.textContent = value.toFixed(2);
        morphControls.updateMorphFactor(value);
        if (!glyphToggle || glyphToggle.checked) {
          glyphControls.updateGlyphs({ morphFactor: value });
        }
      });

      if (basemapToggle) {
        basemapToggle.addEventListener("change", () => {
          morphControls.updateMorphFactor(Number(slider.value));
        });
      }

      statusEl.textContent = "Ready";
    });
  } catch (error) {
    console.error(error);
    if (statusEl) statusEl.textContent = "Something went wrong";
  }
}

bootstrap();


