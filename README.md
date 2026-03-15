# geo-morpher

[![npm version](https://badge.fury.io/js/geo-morpher.svg)](https://badge.fury.io/js/geo-morpher)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

GeoJSON morphing utilities for animating between regular geography and cartograms, with first-class **MapLibre GL JS** support. Smoothly interpolate between any two aligned GeoJSON geometries and overlay multivariate glyphs that stay in sync.

![](demo.gif)

> [!TIP]
> To quickly create a grid cartogram, check out ![gridmapper](https://danylaksono.is-a.dev/gridmapper/).

## Features

- **MapLibre-first**: High-performance adapter for modern vector maps.
- **Smooth Morphing**: Seamlessly interpolate between any two aligned GeoJSON geometries (using `flubber`).
- **Multivariate Glyphs**: Position-synced DOM overlays for charts, icons, and sparklines.
- **Basemap Effects**: Synchronized fading and styling of basemaps during transitions.
- **Projection Agnostic**: Automatic support for WGS84, OSGB, and custom projections.

## Installation

```bash
npm install geo-morpher
```

## Quick Start (MapLibre)

```javascript
import maplibregl from "maplibre-gl";
import { GeoMorpher, createMapLibreMorphLayers } from "geo-morpher";

// 1. Prepare data (regular vs cartogram geography)
const morpher = new GeoMorpher({
  regularGeoJSON: await (await fetch('regular_lsoa.json')).json(),
  cartogramGeoJSON: await (await fetch('cartogram_lsoa.json')).json(),
});
await morpher.prepare();

// 2. Initialize MapLibre
const map = new maplibregl.Map({ ... });

map.on('load', async () => {
  // 3. Create morphing layers
  const morph = await createMapLibreMorphLayers({
    morpher,
    map,
    interpolatedStyle: {
      paint: { "fill-color": "#22c55e", "fill-opacity": 0.4 }
    }
  });

  // 4. Drive the morph (0 = regular, 1 = cartogram)
  morph.updateMorphFactor(0.5);
});
```

## Multivariate Glyphs

Overlay custom visualizations (SVG, Canvas, or HTML) that stay synced with the morphing polygons.

```javascript
import { createMapLibreGlyphLayer } from "geo-morpher";

const glyphLayer = await createMapLibreGlyphLayer({
  morpher,
  map,
  drawGlyph: ({ data, feature }) => ({
    html: `<div class="glyph">${feature.properties.value}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  }),
  maplibreNamespace: maplibregl
});

// Update glyphs during morphing
glyphLayer.updateGlyphs({ morphFactor: 0.5 });
```

## Basemap Effects

Automatically adjust basemap styles as you morph to focus attention on the data.

```javascript
const morph = await createMapLibreMorphLayers({
  morpher,
  map,
  basemapEffect: {
    layers: ["osm-tiles"],
    properties: {
      "raster-opacity": [1, 0.25],
      "raster-saturation": [0, -1]
    }
  }
});
```

## Core API

### GeoMorpher
The core engine for geometry interpolation.
- `new GeoMorpher({ regularGeoJSON, cartogramGeoJSON, data, aggregations })`
- `prepare()`: Run initialization (projection, enrichment).
- `getInterpolatedFeatureCollection(factor)`: Get the geometry at a specific state.

### Projections
Auto-detects WGS84 or OSGB. For UTM or others:
```javascript
import { createProj4Projection } from "geo-morpher";
import proj4 from "proj4";

const projection = createProj4Projection("+proj=utm +zone=33 +datum=WGS84", proj4);
const morpher = new GeoMorpher({ ..., projection });
```

## Examples

Run the local server to see demos:
```bash
npm run examples:browser
```
- **MapLibre Demo**: Basic morphing and glyphs.
- **Indonesia**: Large-scale, multipolygon geometry morphing.
- **Projections**: Custom coordinate systems.

## Legacy Support
Leaflet is still supported via `createLeafletMorphLayers` and `createLeafletGlyphLayer`. See [API Reference](docs/api.md) for details.

## Documentation
- [API Reference](docs/api.md)
- [Glyphs Guide](docs/glyphs.md)

## License
MIT © [Dany Laksono](https://github.com/danylaksono)
