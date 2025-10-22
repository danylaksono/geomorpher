import maplibregl from "maplibre-gl";
import {
  GeoMorpher,
  createMapLibreMorphLayers,
  createMapLibreGlyphLayer,
  parseCSV,
  WGS84Projection,
} from "../../../src/index.js";

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

function createGlyphElement({ data, feature }) {
  if (!data) return null;
  const properties = data.properties ?? {};
  const featureProps = feature?.properties ?? {};
  const provinceCode = featureProps.KODE_INISIAL || featureProps.id || "";

  const container = document.createElement("div");
  container.className = "glyph-marker";
  container.title = featureProps.PROVINSI || String(provinceCode);

  const title = document.createElement("div");
  title.className = "glyph-title";
  title.textContent = provinceCode;
  container.appendChild(title);

  const bars = document.createElement("div");
  bars.className = "glyph-bars";
  container.appendChild(bars);

  metrics.forEach((metric) => {
    const rawValue = Number(properties[metric.key] ?? 0);
    const normalized = metric.normalize(rawValue);
    const barHeight = Math.max(4, Math.round(normalized * 36));

    const bar = document.createElement("div");
    bar.className = "glyph-bar";
    bar.style.height = `${barHeight}px`;
    bar.style.color = metric.color;
    const formatted = metric.format(rawValue);
    bar.title = `${metric.label}: ${formatted}`;
    bar.setAttribute("aria-label", `${metric.label}: ${formatted}`);
    bars.appendChild(bar);
  });

  return container;
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
            "fill-color": "#334155",
            "fill-opacity": 0.28,
            "fill-outline-color": "#0f172a",
          },
        },
        cartogramStyle: {
          paint: {
            "fill-color": "#7c3aed",
            "fill-opacity": 0.22,
            "fill-outline-color": "#6d28d9",
          },
        },
        interpolatedStyle: {
          paint: {
            "fill-color": "#16a34a",
            "fill-opacity": 0.45,
            "fill-outline-color": "#047857",
          },
        },
        basemapEffect: {
          layers: ["osm"],
          properties: {
            "raster-opacity": [1, 0.12],
            "raster-brightness-max": { from: 1, to: 0.88 },
            "raster-saturation": { from: 0, to: -0.3 },
          },
          propertyClamp: {
            "raster-brightness-max": [0, 1],
            "raster-opacity": [0, 1],
          },
          easing: (t) => t * t,
          isEnabled: () => (basemapToggle ? basemapToggle.checked : true),
        },
      });

      const literacyById = literacyRecords.reduce((acc, record) => {
        if (record && record.ID) acc.set(String(record.ID), record);
        return acc;
      }, new Map());

      const glyphControls = await createMapLibreGlyphLayer({
        morpher,
        map,
        morphFactor: initialFactor,
        geometry: "interpolated",
        drawGlyph: ({ feature, featureId }) => {
          const featureCode = featureId ?? feature?.properties?.id;
          const record = literacyById.get(String(featureCode));
          if (!record) {
            return null;
          }

          const element = createGlyphElement({
            data: { properties: record },
            feature,
          });

          if (!element) return null;

          return {
            element,
            markerOptions: {
              pitchAlignment: "map",
              rotationAlignment: "map",
            },
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


