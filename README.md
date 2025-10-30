# geo-morpher

[![npm version](https://badge.fury.io/js/geo-morpher.svg)](https://badge.fury.io/js/geo-morpher)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

GeoJSON morphing utilities for animating between regular geography and cartograms, packaged as a native JavaScript library with a MapLibre-first adapter and Leaflet compatibility helpers.

![](demo.gif)


## Status

This library is currently in early-stage development (v0.1.1) and has recently completed a migration to a MapLibre-first adapter. The core morphing engine is stable, but the MapLibre adapter is new and under active development. Leaflet compatibility is maintained. Community feedback and contributions are welcome.


## Installation

```bash
npm install geo-morpher
```

Leaflet is provided as a peer dependency—bring your own Leaflet instance when using the compatibility helpers. MapLibre remains the default adapter and is bundled as a dependency for out-of-the-box usage; if your build already supplies `maplibre-gl`, mark it as external to avoid duplicating the library.

## Usage

Project structure highlights:

```text
src/
  core/            # GeoMorpher core engine
  adapters/        # Integration helpers (Leaflet, etc.)
  lib/             # Shared runtime utilities (OSGB projection)
  utils/           # Data enrichment and projection helpers
data/              # Sample Oxford LSOA datasets
examples/          # Runnable browser demos (MapLibre & Leaflet)
test/              # node:test coverage for core behaviours
```

### MapLibre adapter (default)

- `createMapLibreMorphLayers` provisions GeoJSON sources and fill layers for regular, cartogram, and interpolated geometries, exposing an `updateMorphFactor` helper to drive tweening from UI controls.
- `createMapLibreGlyphLayer` renders glyphs with `maplibregl.Marker` instances; enable `scaleWithZoom` to regenerate glyph markup as users zoom.
- Pass your MapLibre namespace explicitly (`maplibreNamespace: maplibregl`) when calling glyph helpers in module-bundled builds where `maplibregl` is not attached to `globalThis`.
- For heavy glyph scenes, consider upgrading to a [CustomLayerInterface](https://www.maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/) implementation that batches drawing on the GPU. The marker pipeline keeps the API simple while offering a documented migration path.

#### MapLibre basemap effects

`createMapLibreMorphLayers` accepts a `basemapEffect` configuration that interpolates paint properties on existing style layers as the morph factor changes. This mirrors the Leaflet DOM-based blur/fade behaviour while staying inside the MapLibre style system.

```js
const morph = await createMapLibreMorphLayers({
  morpher,
  map,
  basemapEffect: {
    layers: ["basemap", "basemap-labels"],
    properties: {
      "raster-opacity": [1, 0.15],
      "raster-brightness-max": { from: 1, to: 1.4 },
    },
    propertyClamp: {
      "raster-brightness-max": [0, 2],
    },
    easing: (t) => t * t, // optional easing curve
  },
});

// Update morph factor, basemap effect adjusts automatically
morph.updateMorphFactor(0.75);

// Apply effect manually (e.g., when animating via requestAnimationFrame)
morph.applyBasemapEffect(0.5);
```

- Provide a `layers` string/array or resolver function to target paint properties across multiple layers.
- Supply ranges (`[from, to]` or `{ from, to }`) for numeric properties such as `raster-opacity`, `fill-opacity`, or `line-opacity`.
- Use functions in `properties[layerId]` for full control or to manipulate non-numeric paint values.
- Capture-and-reset logic ensures properties revert to their original values when the effect is disabled.
- Canvas-style blur is not built-in; use a custom MapLibre layer if a true blur shader is required.


### 1. Prepare morphing data

```js
import { GeoMorpher } from "geo-morpher";
import regularGeoJSON from "./data/oxford_lsoas_regular.json" assert { type: "json" };
import cartogramGeoJSON from "./data/oxford_lsoas_cartogram.json" assert { type: "json" };

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  data: await fetchModelData(),
  aggregations: {
    population: "sum",
    households: "sum",
  },
});

await morpher.prepare();

const regular = morpher.getRegularFeatureCollection();
const cartogram = morpher.getCartogramFeatureCollection();
const tween = morpher.getInterpolatedFeatureCollection(0.5);
```

#### Using custom projections

By default, `GeoMorpher` assumes input data is in **OSGB** (British National Grid) and converts to WGS84 for Leaflet. If your data is in a different coordinate system, pass a custom projection:

```js
import { GeoMorpher, WGS84Projection, isLikelyWGS84 } from "geo-morpher";

// Auto-detect coordinate system
const detectedProjection = isLikelyWGS84(regularGeoJSON);
console.log("Detected:", detectedProjection); // 'WGS84', 'OSGB', or 'UNKNOWN'

// For data already in WGS84 (lat/lng)
const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: WGS84Projection, // No transformation needed
});

// For Web Mercator data
import { WebMercatorProjection } from "geo-morpher";
const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: WebMercatorProjection,
});

// Custom projection (e.g., using proj4)
const customProjection = {
  toGeo: ([x, y]) => {
    // Transform [x, y] to [lng, lat]
    return [lng, lat];
  }
};
```

See `examples/maplibre/projections/index.html` for a browser-based custom projection demo.

### 2. Drop the morph straight into Leaflet (compat)

```js
import L from "leaflet";
import { createLeafletMorphLayers } from "geo-morpher";

const basemapLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let blurEnabled = true;

const {
  group,
  regularLayer,
  cartogramLayer,
  tweenLayer,
  updateMorphFactor,
} = await createLeafletMorphLayers({
  morpher,
  L,
  morphFactor: 0.25,
  regularStyle: () => ({ color: "#1f77b4", weight: 1 }),
  cartogramStyle: () => ({ color: "#ff7f0e", weight: 1 }),
  tweenStyle: () => ({ color: "#2ca02c", weight: 2 }),
  onEachFeature: (feature, layer) => {
    layer.bindTooltip(`${feature.properties.code}`);
  },
  basemapLayer,
  basemapEffect: {
    blurRange: [0, 12],
    opacityRange: [1, 0.05],
    grayscaleRange: [0, 1],
    isEnabled: () => blurEnabled,
  },
});

group.addTo(map);

// Update the tween geometry whenever you like
updateMorphFactor(0.75);
```

Provide either `basemapLayer` (any Leaflet layer with a container) or `basemapEffect.target` to tell the helper which element to manipulate. By default the basemap will progressively blur and fade as the morph factor approaches 1, but you can adjust the ranges—or add brightness/grayscale tweaks—to match your design. You can also wire up UI to toggle the behaviour at runtime by returning `false` from `basemapEffect.isEnabled`.

### 3. Overlay multivariate glyphs

The glyph system is **completely customizable** with no hardcoded chart types. You provide a rendering function that can return any visualization you can create with HTML, SVG, Canvas, or third-party libraries like D3.js or Chart.js. The helper automatically keeps markers positioned and synchronized with the morphing geometry.

See the full glyphs guide: `docs/glyphs.md`

**Example with pie charts:**

```js
import {
  GeoMorpher,
  createLeafletMorphLayers,
  createLeafletGlyphLayer,
} from "geo-morpher";

const categories = [
  { key: "population", color: "#4e79a7" },
  { key: "households", color: "#f28e2c" },
];

const drawPie = ({ data, feature }) => {
  const properties = data?.data?.properties ?? feature.properties ?? {};
  const slices = categories
    .map(({ key, color }) => ({
      value: Number(properties[key] ?? 0),
      color,
    }))
    .filter((slice) => slice.value > 0);

  if (slices.length === 0) return null;

  const svg = buildPieSVG(slices); // your own renderer (D3, Canvas, vanilla SVG...)
  return {
    html: svg,
    className: "pie-chart-marker",
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  };
};

const glyphLayer = await createLeafletGlyphLayer({
  morpher,
  L,
  map,
  geometry: "interpolated",
  morphFactor: 0.25,
  pane: "glyphs",
  drawGlyph: drawPie,
});

// Keep glyphs synced with the tweened geometry
slider.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  updateMorphFactor(value);
  glyphLayer.updateGlyphs({ morphFactor: value });
});
```

`drawGlyph` receives `{ feature, featureId, data, morpher, geometry, morphFactor }` and can return:

- `null`/`undefined` to skip the feature
- A plain HTML string or DOM element
- An object with `html`, `iconSize`, `iconAnchor`, `className`, `pane`, and optional `markerOptions`
- Or an object containing a pre-built `icon` (any Leaflet `Icon`), if you need full control

**Configuration object properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `html` | string \| HTMLElement | - | Your custom HTML/SVG string or DOM element |
| `className` | string | `"geomorpher-glyph"` | CSS class for the marker |
| `iconSize` | [number, number] | `[48, 48]` | Width and height in pixels |
| `iconAnchor` | [number, number] | `[24, 24]` | Anchor point in pixels (center by default) |
| `pane` | string | - | Leaflet pane name for z-index control |
| `markerOptions` | object | `{}` | Additional Leaflet marker options |
| `divIconOptions` | object | `{}` | Additional Leaflet divIcon options |
| `icon` | L.Icon | - | Pre-built Leaflet icon (overrides all other options) |

Optionally provide `getGlyphData` or `filterFeature` callbacks to customise how data/visibility is resolved. When you call `glyphLayer.clear()` all markers are removed; `glyphLayer.getState()` exposes the current geometry, morph factor, and marker count.

#### Data contract for glyphs

By default `createLeafletGlyphLayer` will surface whatever the core `GeoMorpher` knows about the current feature via `morpher.getKeyData()`:

| field        | type     | description |
|--------------|----------|-------------|
| `feature`    | GeoJSON Feature | The rendered feature taken from the requested geography (`regular`, `cartogram`, or tweened). Includes `feature.properties` and a `centroid` array. |
| `featureId`  | string  | Resolved via `getFeatureId(feature)` (defaults to `feature.properties.code ?? feature.properties.id`). |
| `data`       | object \| null | When using the built-in lookup this is the morpher key entry: `{ code, population, data }`. The `data` property holds the *enriched* GeoJSON feature returned from `GeoMorpher.prepare()`—handy when you stored additional indicators during enrichment. |
| `morpher`    | `GeoMorpher` | The instance you passed in, allowing on-demand queries (`getInterpolatedLookup`, etc.). |
| `geometry`   | string \| function | The geometry source currently in play (`regular`, `cartogram`, or `interpolated`). |
| `morphFactor`| number  | The morph factor used for the last update (only meaningful when geometry is `interpolated`). |

If you want a different data shape, supply `getGlyphData`:

```js
const glyphLayer = await createLeafletGlyphLayer({
  morpher,
  L,
  drawGlyph,
  getGlyphData: ({ featureId }) => externalStatsById[featureId],
});
```

The callback receives the same context object (minus the final `data` field) and should return whatever payload your renderer expects. `filterFeature(context)` lets you drop glyphs entirely (return `false`) for a given feature.

#### Alternative chart types and rendering approaches

The glyph system accepts any HTML/SVG content. Here are examples with different visualization types:

**Bar chart:**
```js
drawGlyph: ({ data, feature }) => {
  const values = [data.value1, data.value2, data.value3];
  const bars = values.map((v, i) => 
    `<rect x="${i*20}" y="${60-v}" width="15" height="${v}" fill="steelblue"/>`
  ).join('');
  
  return {
    html: `<svg width="60" height="60">${bars}</svg>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  };
}
```

**Using D3.js:**
```js
import * as d3 from "d3";

drawGlyph: ({ data }) => {
  const div = document.createElement('div');
  div.style.width = '80px';
  div.style.height = '80px';
  
  const svg = d3.select(div).append('svg')
    .attr('width', 80)
    .attr('height', 80);
  
  // Use D3 to create any visualization
  svg.selectAll('circle')
    .data(data.values)
    .enter().append('circle')
    .attr('cx', (d, i) => i * 20 + 10)
    .attr('cy', 40)
    .attr('r', d => d.radius)
    .attr('fill', d => d.color);
  
  return div; // Return DOM element directly
}
```

**Custom icons or images:**
```js
drawGlyph: ({ data }) => {
  return {
    html: `<img src="/icons/${data.category}.png" width="32" height="32"/>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  };
}
```

**Pre-built Leaflet icons:**
```js
drawGlyph: ({ data }) => {
  const icon = L.icon({
    iconUrl: `/markers/${data.type}.png`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
  
  return { icon }; // Full control over Leaflet icon
}
```

**Sparkline with HTML Canvas:**
```js
drawGlyph: ({ data }) => {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  
  // Draw sparkline
  ctx.strokeStyle = '#4e79a7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.timeSeries.forEach((value, i) => {
    const x = (i / (data.timeSeries.length - 1)) * 80;
    const y = 40 - (value * 40);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  return canvas.toDataURL(); // Return as data URL
}
```

#### Zoom-scaling glyphs

By default, glyphs maintain a fixed pixel size regardless of map zoom level (standard Leaflet marker behavior). However, you can enable `scaleWithZoom` to make glyphs resize proportionally with the underlying map features—ideal for waffle charts, heatmap cells, or other visualizations that should fill polygon bounds.

```js
const glyphLayer = await createLeafletGlyphLayer({
  morpher,
  L,
  map,
  scaleWithZoom: true, // Enable zoom-responsive sizing
  drawGlyph: ({ data, feature, featureBounds, zoom }) => {
    if (!featureBounds) return null;
    
    const { width, height } = featureBounds; // Pixel dimensions at current zoom
    
    // Create waffle chart that fills the cartogram polygon
    const gridSize = 10;
    const cellSize = Math.min(width, height) / gridSize;
    const fillRatio = data.value / data.max;
    const filledCells = Math.floor(gridSize * gridSize * fillRatio);
    
    const cells = [];
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const index = i * gridSize + j;
        const filled = index < filledCells;
        cells.push(
          `<rect x="${j * cellSize}" y="${i * cellSize}" 
                 width="${cellSize}" height="${cellSize}" 
                 fill="${filled ? '#4e79a7' : '#e0e0e0'}"/>`
        );
      }
    }
    
    return {
      html: `<svg width="${width}" height="${height}">${cells.join('')}</svg>`,
      iconSize: [width, height],
      iconAnchor: [width / 2, height / 2],
    };
  },
});
```

When `scaleWithZoom` is enabled:
- `featureBounds` provides `{ width, height, center, bounds }` in pixels at the current zoom level
- `zoom` provides the current map zoom level
- Glyphs automatically update when users zoom in/out
- Call `glyphLayer.destroy()` to clean up zoom listeners when removing the layer

A complete example is available at `examples/leaflet/zoom-scaling-glyphs.html`.

### Legacy wrapper

If you previously relied on the `geoMorpher` factory from the Observable notebook, it is still available:

```js
import { geoMorpher } from "geo-morpher";

const result = await geoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  data,
  aggregations,
  morphFactor: 0.5,
});

console.log(result.tweenLookup);
```

### Node script (removed)

The previous Node-only example has been removed in favor of browser-based demos under `examples/maplibre` and `examples/leaflet`.

### Native browser examples (MapLibre & Leaflet)

Serve the browser demos to see geo-morpher running on top of either Leaflet or MapLibre without a build step. Dependencies are resolved via import maps to CDN-hosted ES modules.

```bash
npm run examples:browser
```

Then open:
- MapLibre demo: <http://localhost:4173/examples/maplibre/index.html>
- Indonesia (MapLibre): <http://localhost:4173/examples/maplibre/indonesia/index.html>
- MapLibre (Projections): <http://localhost:4173/examples/maplibre/projections/index.html>
- Leaflet demo: <http://localhost:4173/examples/leaflet/index.html>
- Leaflet zoom-scaling: <http://localhost:4173/examples/leaflet/zoom-scaling-glyphs.html>

Each demo provides a morph slider and glyph overlays; the MapLibre version showcases GPU-driven rendering, paint-property basemap fading, and DOM marker glyphs running through the new adapter. (An internet connection is required to fetch CDN-hosted modules and map tiles.)

**Additional examples:**
- `examples/maplibre/index.html` - MapLibre adaptation with basemap paint-property effects and layer toggles
- `examples/leaflet/zoom-scaling-glyphs.html` - Demonstrates zoom-responsive waffle charts that resize to fill cartogram polygons as you zoom in/out

## Testing

Run the bundled smoke tests with:

```bash
npm test
```

## License

MIT

## Documentation

- API Reference: `docs/api.md`
- Glyphs Guide: `docs/glyphs.md`
