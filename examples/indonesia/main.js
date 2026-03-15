import maplibregl from "maplibre-gl";
import {
  GeoMorpher,
  createMapLibreMorphLayers,
  createMapLibreCustomGlyphLayer,
  parseCSV,
  WGS84Projection,
} from "../../src/index.js";
import { flattenPositions } from "../../src/adapters/shared/geometry.js";

const metrics = [
  {
    key: "Indeks Pembangunan Literasi Masyarakat",
    label: "Literacy Index",
    color: "#3b82f6", // Vibrant Blue
    format: (value) => `${value.toFixed(2)} pts`,
  },
  {
    key: "Pemerataan Layanan Perpustakaan",
    label: "Library Access",
    color: "#06b6d4", // Cyan
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "Ketercukupan Koleksi Perpustakaan",
    label: "Collection Sufficiency",
    color: "#f59e0b", // Amber
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "Rasio Ketercukupan Tenaga Perpustakaan",
    label: "Staff Adequacy",
    color: "#ef4444", // Red
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "Tingkat Kunjungan Masyarakat per hari",
    label: "Daily Visits",
    color: "#a855f7", // Purple
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
];

const BASE_STYLE = {
  version: 8,
  name: "Indonesia Literacy",
  metadata: {
    "geo-morpher": "maplibre-demo-indonesia",
  },
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
        "background-color": "#020617",
      },
    },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-opacity": 0.2,
        "raster-brightness-max": 0.6,
        "raster-saturation": -0.7,
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

const tooltipEl = document.getElementById("tooltip");
const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const playButton = document.getElementById("play-button");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const glyphLegendEl = document.getElementById("glyphLegend");
const regularToggle = document.getElementById("toggle-regular");
const interpolatedToggle = document.getElementById("toggle-interpolated");
const cartogramToggle = document.getElementById("toggle-cartogram");
const glyphToggle = document.getElementById("toggle-glyphs");
let hasBootstrapped = false;
let isPlaying = false;
let animationFrameId = null;
let animationDirection = 1; // 1 for 0->1, -1 for 1->0

// comparison mode state --------------------------------------------------
// when a province/glyph is clicked we compute an outline drawing function
// for that province's glyph shape; the function is invoked during glyph
// rendering to project the white outline across every glyph on the canvas.
let comparisonOutlineDraw = null;
// last selected properties (used for hover comparisons)
let selectedComparisonProperties = null;
// will be populated after the glyph layer is created
let glyphControls;
// store the most recent hovered props so we can rebuild tooltip on selection change
let lastHoveredProps = null;

function createComparisonOutline(properties) {
  // compute normalized lengths once; the returned function will scale them
  // appropriately for whatever glyph size is being drawn
  const normalizedLens = metrics.map((m) => {
    const rawValue = Number(properties[m.key] ?? 0);
    return m.normalize(rawValue);
  });

  return (ctx, x, y, size) => {
    const radius = size / 2 - 4;
    const centerRadius = 3;
    const angleStep = (Math.PI * 2) / metrics.length;

    ctx.save();
    ctx.beginPath();
    normalizedLens.forEach((norm, i) => {
      const petalLength = 2 + norm * (radius - centerRadius - 2);
      const angle = angleStep * i - Math.PI / 2;
      const sx = Math.cos(angle) * (centerRadius + petalLength);
      const sy = Math.sin(angle) * (centerRadius + petalLength);
      if (i === 0) {
        ctx.moveTo(x + sx, y + sy);
      } else {
        ctx.lineTo(x + sx, y + sy);
      }
    });
    ctx.closePath();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };
}


// helper to build tooltip html given hovered and optionally selected props
function buildTooltipHTML(hoverProps, selectedProps) {
  if (!hoverProps) return "";

  const buildRows = () =>
    metrics
      .map((m) => {
        const leftValue = m.format(hoverProps[m.key]);
        const rightValue = selectedProps ? m.format(selectedProps[m.key]) : null;

        if (selectedProps) {
          return `
            <tr>
              <td class="tooltip-label">${m.label}</td>
              <td class="tooltip-value" style="color:${m.color}">${leftValue}</td>
              <td class="tooltip-value right" style="color:${m.color}">${rightValue}</td>
            </tr>
          `;
        }
        return `
          <div class="tooltip-row">
            <span class="tooltip-label">${m.label}</span>
            <span class="tooltip-value" style="color:${m.color}">${leftValue}</span>
          </div>
        `;
      })
      .join("");

  if (selectedProps) {
    return `
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th class="header-hovered">${hoverProps.PROVINSI}</th>
            <th class="header-selected">${selectedProps.PROVINSI}</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows()}
        </tbody>
      </table>
    `;
  }

  return `<div class="tooltip-header">${hoverProps.PROVINSI}</div>` + buildRows();
}

function updateComparisonSelection(props) {
  selectedComparisonProperties = props || null;
  if (props) {
    comparisonOutlineDraw = createComparisonOutline(props);
  } else {
    comparisonOutlineDraw = null;
  }
  if (glyphControls) {
    // force all glyphs to redraw with new outline state
    glyphControls.updateGlyphs({});
  }
  // if we are currently displaying a tooltip, refresh its content
  if (tooltipEl && lastHoveredProps) {
    tooltipEl.innerHTML = buildTooltipHTML(lastHoveredProps, selectedComparisonProperties);
  }
}


function hideTooltip(map) {
  if (tooltipEl) {
    tooltipEl.style.display = "none";
  }

  if (map?.getCanvas) {
    map.getCanvas().style.cursor = "";
  }
}

async function fetchJSON(fileName) {
  const response = await fetch(new URL(`../../data/${fileName}`, import.meta.url));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

async function fetchText(fileName) {
  const response = await fetch(new URL(`../../data/${fileName}`, import.meta.url));
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
  if (!data) return null;
  const properties =
    data?.data?.properties ??
    data?.properties ??
    feature?.properties ?? {};

  return {
    size: 72,
    shape: "custom",
    customRender: (ctx, x, y, size) => {
      const radius = size / 2 - 4;
      const centerRadius = 3;
      const spikes = metrics.length;
      const angleStep = (Math.PI * 2) / spikes;

      // Drop shadow for the whole glyph
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowOffsetY = 2;

      // Draw background circle
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Draw grid circles
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 0.5;
      [0.25, 0.5, 0.75, 1.0].forEach(p => {
        const r = centerRadius + p * (radius - centerRadius);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Draw petals
      metrics.forEach((metric, i) => {
        const rawValue = Number(properties[metric.key] ?? 0);
        const normalized = metric.normalize(rawValue);
        const petalLength = 2 + normalized * (radius - centerRadius - 2);

        const startAngle = angleStep * i - Math.PI / 2 - angleStep / 2 + 0.08;
        const endAngle = angleStep * i - Math.PI / 2 + angleStep / 2 - 0.08;

        // Petal shape
        ctx.save();
        ctx.fillStyle = metric.color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(startAngle) * centerRadius, y + Math.sin(startAngle) * centerRadius);
        ctx.arc(x, y, centerRadius + petalLength, startAngle, endAngle);
        ctx.lineTo(x + Math.cos(endAngle) * centerRadius, y + Math.sin(endAngle) * centerRadius);
        ctx.closePath();
        ctx.fill();

        // Highlighting edge
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });

      // Draw center circle with glow
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, centerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // if a comparison glyph is selected, draw its outline
      if (typeof comparisonOutlineDraw === "function") {
        comparisonOutlineDraw(ctx, x, y, size);
      }
    },
  };
}

function normalizeLiteracyRecords(records) {
  const numericKeys = new Set(metrics.map((metric) => metric.key));
  
  // First pass: find min/max for each metric
  metrics.forEach(metric => {
    const values = records.map(r => Number(r[metric.key])).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // We want a bit of padding so the smallest isn't zero length
    metric.normalize = (val) => {
      const v = Number(val);
      if (isNaN(v)) return 0;
      if (max === min) return 0.5;
      return clamp((v - min) / (max - min));
    };
  });

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
  if (hasBootstrapped) {
    return;
  }
  hasBootstrapped = true;

  try {
    if (statusEl) {
      statusEl.textContent = "Loading data…";
    }

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
            "fill-color": "#1e293b",
            "fill-opacity": 0.4,
            "fill-outline-color": "rgba(255,255,255,0.2)",
          },
        },
        cartogramStyle: {
          paint: {
            "fill-color": "#1e293b",
            "fill-opacity": 0.4,
            "fill-outline-color": "rgba(255,255,255,0.2)",
          },
        },
        interpolatedStyle: {
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#60a5fa",
              "#3b82f6"
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.4,
              0.15
            ],
            "fill-outline-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#ffffff",
              "rgba(255, 255, 255, 0.4)"
            ],
          },
        },
      });

      // Update OSM opacity based on initial factor
      map.setPaintProperty("osm", "raster-opacity", 0.2 * (1 - initialFactor));

      let hoveredStateId = null;

      // Add province labels layer
      map.addSource("province-labels", {
        type: "geojson",
        data: morpher.getInterpolatedFeatureCollection(initialFactor),
      });

      map.addLayer({
        id: "province-labels-layer",
        type: "symbol",
        source: "province-labels",
        layout: {
          "text-field": ["get", "PROVINSI"],
          "text-font": ["Open Sans Regular"],
          "text-size": 10,
          "text-offset": [0, 2.5],
          "text-anchor": "top",
          "text-transform": "uppercase",
          "text-letter-spacing": 0.1,
        },
        paint: {
          "text-color": "#94a3b8",
          "text-halo-color": "rgba(2, 6, 23, 0.8)",
          "text-halo-width": 1,
        },
      });

      glyphControls = await createMapLibreCustomGlyphLayer({
        morpher,
        map,
        morphFactor: initialFactor,
        geometry: "interpolated",
        drawGlyph: ({ feature, featureId, data }) => {
          if (!data) return null;
          return createRoseChartGlyph({ data, feature });
        },
        glyphOptions: {
          size: 72,
        },
      });

      const applyLayerVisibility = () => {
        const vis = {
          regular: regularToggle ? regularToggle.checked : false,
          cartogram: cartogramToggle ? cartogramToggle.checked : false,
          interpolated: interpolatedToggle ? interpolatedToggle.checked : true,
        };
        morphControls.setLayerVisibility(vis);
        
        map.setLayoutProperty(
          "province-labels-layer",
          "visibility",
          vis.interpolated ? "visible" : "none"
        );

        if (glyphToggle && !glyphToggle.checked) {
          glyphControls.clear();
        } else {
          glyphControls.updateGlyphs({ morphFactor: Number(slider.value) });
        }
      };

      // Hover handling
      const handleMouseMove = (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [
            morphControls.layerIds.interpolated,
            morphControls.layerIds.regular,
            morphControls.layerIds.cartogram
          ].filter(id => map.getLayer(id))
        });

        if (features.length > 0) {
          const feature = features[0];
          
          if (hoveredStateId !== null && hoveredStateId !== undefined) {
            map.setFeatureState(
              { source: morphControls.sourceIds.interpolated, id: hoveredStateId },
              { hover: false }
            );
          }
          hoveredStateId = feature.id;
          if (hoveredStateId !== null && hoveredStateId !== undefined) {
            map.setFeatureState(
              { source: morphControls.sourceIds.interpolated, id: hoveredStateId },
              { hover: true }
            );
          }

          // Use featureId or properties.id to join with morpher data
          const id = feature.properties.id || feature.properties.ID;
          const data = morpher.getKeyData()[id];

          if (data && tooltipEl) {
            const props = data.data.properties;
            lastHoveredProps = props;
            tooltipEl.innerHTML = buildTooltipHTML(props, selectedComparisonProperties);
            tooltipEl.style.display = "block";
            tooltipEl.style.left = `${e.originalEvent.pageX + 15}px`;
            tooltipEl.style.top = `${e.originalEvent.pageY + 15}px`;
            map.getCanvas().style.cursor = "pointer";
          }
        } else {
          hideTooltip(map);
        }
      };

      const hideTooltip = () => {
        if (tooltipEl) {
          tooltipEl.style.display = "none";
        }
        if (map?.getCanvas) {
          map.getCanvas().style.cursor = "";
        }
        if (hoveredStateId !== null && hoveredStateId !== undefined) {
          map.setFeatureState(
            { source: morphControls.sourceIds.interpolated, id: hoveredStateId },
            { hover: false }
          );
          hoveredStateId = null;
        }
      };

      map.on("mousemove", handleMouseMove);
      map.on("mouseleave", morphControls.layerIds.interpolated, hideTooltip);
      map.on("movestart", hideTooltip);
      map.on("zoomstart", hideTooltip);

      // comparison mode click handler
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [
            morphControls.layerIds.interpolated,
            morphControls.layerIds.regular,
            morphControls.layerIds.cartogram,
          ].filter((id) => map.getLayer(id)),
        });

        if (features.length > 0) {
          const feat = features[0];
          const id = feat.properties.id || feat.properties.ID;
          const data = morpher.getKeyData()[id];
          if (data && data.data && data.data.properties) {
            updateComparisonSelection(data.data.properties);
            return;
          }
        }
        // clicked outside any province -> clear selection
        updateComparisonSelection(null);
      });

      applyLayerVisibility();

      [regularToggle, cartogramToggle, interpolatedToggle, glyphToggle]
        .filter(Boolean)
        .forEach((input) => input.addEventListener("change", applyLayerVisibility));

      if (bounds && typeof bounds.isEmpty === "function" && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, linear: true, duration: 0 });
      }

      const updateUIForFactor = (value) => {
        slider.value = value;
        factorValue.textContent = value.toFixed(2);
        morphControls.updateMorphFactor(value);

        // Update OSM opacity
        map.setPaintProperty("osm", "raster-opacity", 0.2 * (1 - value));

        // Update labels
        const source = map.getSource("province-labels");
        if (source) {
          source.setData(morpher.getInterpolatedFeatureCollection(value));
        }

        if (!glyphToggle || glyphToggle.checked) {
          glyphControls.updateGlyphs({ morphFactor: value });
        }
      };

      slider.addEventListener("input", (event) => {
        const value = Number(event.target.value);
        if (isPlaying) {
          stopAnimation();
        }
        updateUIForFactor(value);
      });

      let lastTimestamp = 0;
      const animate = (timestamp) => {
        if (!isPlaying) return;

        if (!lastTimestamp) lastTimestamp = timestamp;
        const elapsed = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        // Roughly 1.5 seconds for a full 0 to 1 transition
        const speed = 0.0006;
        let currentValue = Number(slider.value);
        
        currentValue += elapsed * speed * animationDirection;

        if (animationDirection === 1 && currentValue >= 1) {
          currentValue = 1;
          updateUIForFactor(currentValue);
          animationDirection = -1; // Set next direction
          stopAnimation();
          return;
        } else if (animationDirection === -1 && currentValue <= 0) {
          currentValue = 0;
          updateUIForFactor(currentValue);
          animationDirection = 1; // Set next direction
          stopAnimation();
          return;
        }

        updateUIForFactor(currentValue);
        animationFrameId = requestAnimationFrame(animate);
      };

      const startAnimation = () => {
        if (isPlaying) return;
        
        // Ensure starting point is correct for the current direction 
        // if user manually moved the slider
        const currentValue = Number(slider.value);
        if (animationDirection === 1 && currentValue >= 1) {
          updateUIForFactor(0);
        } else if (animationDirection === -1 && currentValue <= 0) {
          updateUIForFactor(1);
        }

        isPlaying = true;
        lastTimestamp = 0;
        playIcon.style.display = "none";
        pauseIcon.style.display = "block";
        animationFrameId = requestAnimationFrame(animate);
      };

      const stopAnimation = () => {
        isPlaying = false;
        playIcon.style.display = "block";
        pauseIcon.style.display = "none";
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      };

      playButton.addEventListener("click", () => {
        if (isPlaying) {
          stopAnimation();
        } else {
          startAnimation();
        }
      });

      if (statusEl) {
        statusEl.textContent = "Ready";
      }
    });
  } catch (error) {
    console.error(error);
    if (statusEl) {
      statusEl.textContent = "Something went wrong";
    }
    hasBootstrapped = false;
  }
}

bootstrap();


