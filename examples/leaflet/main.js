// This example demonstrates morphing between regular geography and cartogram
// using GeoMorpher with Leaflet, allowing users to interpolate between
// standard geographic boundaries and distorted cartogram representations
// based on data values like population and households.

import L from "npm:leaflet";
import * as d3 from "npm:d3";
import {
  GeoMorpher,
  createLeafletMorphLayers,
  createLeafletGlyphLayer,
} from "../../src/index.js";

// Utility function to format numeric statistics with locale-specific formatting
// for display in the UI, limiting to whole numbers for clarity
const formatStat = (value) => value.toLocaleString(undefined, {
  maximumFractionDigits: 0,
});

// Get references to DOM elements for updating status, controlling morph factor,
// displaying counts, and toggling basemap effects
const statusEl = document.getElementById("status");
const slider = document.getElementById("morphFactor");
const factorValue = document.getElementById("factorValue");
const regularCountEl = document.getElementById("count-regular");
const cartogramCountEl = document.getElementById("count-cartogram");
const basemapToggle = document.getElementById("basemapBlurToggle");
const glyphLegendEl = document.getElementById("glyphLegend");

// Helper function to fetch JSON data files from the data directory
// using ES modules URL resolution for reliable path handling
async function fetchJSON(fileName) {
  const url = new URL(`../../data/${fileName}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

// Main asynchronous function to initialize the map, load data,
// create morphing layers, and set up user interactions
async function bootstrap() {
  try {
    // Update status to inform user that data is loading
    statusEl.textContent = "Loading data…";

    // Load both regular geographic boundaries and cartogram-distorted versions
    // in parallel for efficient initialization
    const [regularGeoJSON, cartogramGeoJSON] = await Promise.all([
      fetchJSON("oxford_lsoas_regular.json"),
      fetchJSON("oxford_lsoas_cartogram.json"),
    ]);

    // Define how data properties should be aggregated when morphing
    // between regular and cartogram geometries
    const aggregations = {
      population: "sum",
      households: "sum",
    };

    // Extract sample data from regular GeoJSON features for morphing calculations,
    // ensuring numeric values for population and households
    const sampleData = regularGeoJSON.features.map((feature) => ({
      lsoa: feature.properties.code,
      population: Number(feature.properties.population ?? 0),
      households: Number(feature.properties.households ?? 0),
    }));

    // Create GeoMorpher instance with regular/cartogram geometries and data
    // to enable interpolation between geographic representations
    const morpher = new GeoMorpher({
      regularGeoJSON,
      cartogramGeoJSON,
      data: sampleData,
      aggregations,
    });

    // Prepare the morpher by building internal data structures and spatial indexes
    // necessary for efficient morphing calculations
    await morpher.prepare();

    // Create Leaflet map with canvas rendering preference for better performance
    // when handling many vector features during morphing
    const map = L.map("map", { preferCanvas: true });
    // Set initial view centered on Oxford, UK with appropriate zoom level
    map.setView([51.752, -1.2577], 12);

    // Create a custom map pane for glyph markers to ensure they appear
    // above other layers with appropriate z-index and disabled pointer events
    // to prevent interference with map interactions
    const glyphPane = map.createPane("glyphs");
    glyphPane.style.zIndex = 650;
    glyphPane.style.pointerEvents = "none";

    // Add OpenStreetMap tile layer as basemap for geographic context
    const basemapLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Initialize morph factor from slider value and update display
    const initialFactor = Number(slider.value);
    factorValue.textContent = initialFactor.toFixed(2);
    let currentMorphFactor = initialFactor;
    // Initialize basemap effect toggle state
    let basemapEffectEnabled = basemapToggle ? basemapToggle.checked : true;

    // Define data categories for glyph visualization with colors
    // representing population and households in pie chart glyphs
    const categories = [
      { key: "population", label: "Population", color: "#4e79a7" },
      { key: "households", label: "Households", color: "#f28e2c" },
    ];

    // Create legend for glyph categories if legend element exists
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

    // Create morphing layers (regular, tween, cartogram) with custom styles
    // and interactions to visualize the transition between geographic representations
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

    // Add the morphing layer group to the map to display the layers
    group.addTo(map);

    // Create glyph layer for visualizing data as pie charts at morphed positions,
    // using interpolated geometry to place glyphs between regular and cartogram locations
    const glyphControls = await createLeafletGlyphLayer({
      morpher,
      L,
      map,
      geometry: "interpolated",
      morphFactor: initialFactor,
      pane: "glyphs",
      drawGlyph: ({ data, feature }) => {
        // Extract data properties for glyph rendering
        const properties = data?.data?.properties ?? feature.properties ?? {};
        // Create pie chart slices for each data category with positive values
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

        // Define pie chart dimensions and calculate SVG path segments
        const radius = 26;
        const size = 52;
        const center = radius;
        // Use d3.pie and d3.arc to generate paths more simply
        const pie = d3.pie().value((d) => d.value).sort(null);
        const arcs = pie(slices);
        const arcGen = d3.arc().innerRadius(0).outerRadius(radius);

        const svg = d3
          .create("svg")
          .attr("width", size)
          .attr("height", size)
          .attr("viewBox", `0 0 ${size} ${size}`)
          .attr("xmlns", "http://www.w3.org/2000/svg");

        const g = svg.append("g").attr("transform", `translate(${center},${center})`);

        for (const a of arcs) {
          g.append("path")
            .attr("d", arcGen(a))
            .attr("fill", a.data.color)
            .attr("stroke", "white")
            .attr("stroke-width", 1);
        }

        // Return an object so we can keep the CSS class and explicit sizing
        return {
          html: svg.node(),
          className: "pie-chart-marker",
          iconSize: [size, size],
          iconAnchor: [radius, radius],
        };
      },
    });

    // Extract the glyph layer from controls for adding to layer controls
    const glyphLayer = glyphControls.layer;

    // Define overlay layers for the layer control panel, allowing users
    // to toggle visibility of different geographic representations and glyphs
    const overlays = {
      "Regular geography": regularLayer,
      "Tween morph": tweenLayer,
      "Cartogram geography": cartogramLayer,
      "Pie glyphs": glyphLayer,
    };

    // Add layer control to the map, collapsed on mobile devices for better UX
    L.control.layers(null, overlays, {
      collapsed: window.matchMedia("(max-width: 768px)").matches,
    }).addTo(map);

    // Fit the map view to the bounds of the regular geography layer
    // with padding to ensure all features are visible
    map.fitBounds(regularLayer.getBounds(), { padding: [20, 20] });

    // Display the number of features in regular and cartogram datasets
    // to provide context about the data being visualized
    regularCountEl.textContent = formatStat(
      morpher.getRegularFeatureCollection().features.length
    );
    cartogramCountEl.textContent = formatStat(
      morpher.getCartogramFeatureCollection().features.length
    );

    // Add event listener to morph factor slider to update the morphing
    // in real-time as the user adjusts the interpolation factor
    slider.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      factorValue.textContent = value.toFixed(2);
      currentMorphFactor = value;
      updateMorphFactor(value);
      glyphControls.updateGlyphs({ morphFactor: value });
    });

    // Add event listener to basemap effect toggle to enable/disable
    // visual effects on the basemap during morphing transitions
    if (basemapToggle) {
      basemapToggle.addEventListener("change", (event) => {
        basemapEffectEnabled = event.target.checked;
        updateMorphFactor(currentMorphFactor);
        glyphControls.updateGlyphs({ morphFactor: currentMorphFactor });
      });
    }

    // Update status to indicate successful initialization
    statusEl.textContent = "Ready";
  } catch (error) {
    // Log any errors during initialization and update status for user feedback
    console.error(error);
    statusEl.textContent = "Something went wrong";
  }
}

// Start the application by calling the bootstrap function
bootstrap();


