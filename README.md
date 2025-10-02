# geo-morpher

Imperative GeoJSON morphing utilities for animating between regular geography and cartograms, now packaged as a native JavaScript library with first-class Leaflet helpers.

## Installation

```bash
npm install geo-morpher
```

Bring your own Leaflet instance (listed as a peer dependency).

## Usage

Project structure highlights:

```text
src/
  core/            # GeoMorpher core engine
  adapters/        # Integration helpers (Leaflet, etc.)
  lib/             # Shared runtime utilities (OSGB projection)
  utils/           # Data enrichment and projection helpers
data/              # Sample Oxford LSOA datasets
examples/          # Runnable native JS scripts
test/              # node:test coverage for core behaviours
```

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

### 2. Drop the morph straight into Leaflet

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

### Native JS example

A runnable script using the bundled Oxford datasets lives in `examples/native.js`:

```bash
node examples/native.js
```

It loads `data/oxford_lsoas_regular.json` and `data/oxford_lsoas_cartogram.json`, mirrors their population/household properties into a basic dataset, and prints counts plus a sample tweened feature—all without any bundlers or UI frameworks.

### Native browser example (Leaflet)

Serve `examples/browser/index.html` to see the morph on top of Leaflet without a build step. Dependencies are resolved via import maps to CDN-hosted ES modules.

```bash
npm run examples:browser
```

Then open <http://localhost:4173/examples/browser/>. A slider lets you tween between the regular and cartogram geometries in real time while a Leaflet layer control toggles each geography on and off, keeping the matching feature counts on display. (An internet connection is required to fetch the CDN-hosted modules and map tiles.)

## Testing

Run the bundled smoke tests with:

```bash
npm test
```

## License

MIT
