# Winchester Example

This document explains the structure and usage of the `winchester` demo, which
shows multi-layer morphing (LSOA, MSOA, Ward) along with area circles on a
MapLibre background.

## Purpose

The example demonstrates:

- How to initialise multiple `GeoMorpher` instances and control them
  independently.
- Per-layer sliders (with optional linking) for adjusting morph factors.
- Cartogram data alignment when features don't share a natural join key.
- Optional area circles that update alongside the morph.
- A minimal UI that keeps interactions focused and self-documenting.

## Folder layout

```
examples/winchester/
├── index.html          # UI and controls
├── main.js             # demo logic
└── winchester_*.geojson  # geography and cartogram data
```

The geojson files come from the repository's `data/winchester/` directory.

## Key implementation notes

### Import map

`index.html` uses the same importmap as other examples. Make sure the
`maplibre-gl`, `@turf/turf`, `flubber`, and `lodash` entries are present (see
`examples/README.md`).

### Joining regular and cartogram

The local Winchester data does **not** contain a shared `code` property. The
regular geography uses a string `LSOA21CD` and a numeric `FID`; the cartogram
features merely embed the numeric FID inside `properties.names`.

To make the two collections align we add a `code` property to every feature
before creating the morphers:

```js
const patchJoin = (reg, cart) => {
  reg.features.forEach((f) => {
    if (!f.properties) f.properties = {};
    f.properties.code = f.properties.FID ?? f.properties.LSOA21CD ?? f.properties.code;
  });
  cart.features.forEach((f) => {
    if (!f.properties) f.properties = {};
    if (Array.isArray(f.properties.names) && f.properties.names.length) {
      f.properties.code = f.properties.names[0];
    }
  });
};
```

Call `patchJoin` on each level (LSOA, MSOA, Ward) immediately after fetching
JSON and before constructing the `GeoMorpher` instances.

### Area circles

Circles are derived from the centroids of whichever geometry is currently
visible. The helper `createAreaCollection(morpher, factor)` returns a
`FeatureCollection` for the given `factor` (0 = regular, 1 = cartogram):

```js
function createAreaCollection(morpher, factor = 0) {
  const fc = factor === 0
    ? morpher.getRegularFeatureCollection()
    : morpher.getInterpolatedFeatureCollection(factor);
  return {
    type: "FeatureCollection",
    features: fc.features.map(createAreaPoint).filter(Boolean),
  };
}
```

Each slider `input` event and the `Test 50%` button update both the controller
and the circle source via `map.getSource(...).setData(...)`.

### Controls UI

`index.html` supplies:

- A status indicator at top-right.
- A panel of cards, one per layer, each containing:
  - A slider (step = 0.01) and live value label.
  - Two toggles: `Morph layers` (visibility of regular/cartogram/interpolated)
    and `Area circles` (visibility of the circle layer, off by default).
- A `Link sliders` checkbox to synchronize all morph factors.
- A `Test 50%` button to set every factor to 0.5 instantly.

Event listeners in `main.js` wire those elements to the morph controllers and
circle sources. See the `bootstrap()` function for details.

### Running the demo

1. Start the dev server:

   ```bash
   npm run examples:browser
   ```

2. Open `http://localhost:4173/examples/winchester/index.html`.

3. Use the UI to explore morphing at each layer.

## Replication steps

To replicate the example for your own data, follow these steps:

1. **Prepare two GeoJSON collections** (regular and cartogram) for each layer.
   Ensure every feature has a unique identifier. If the two sets use different
   property names, adjust `patchJoin` accordingly.

2. **Copy `index.html` and `main.js`** into your own folder under
   `examples/`.

3. **Update the importmap paths** if you use newer versions of libraries.

4. **Adjust `layerDefinitions`** at the top of `main.js` for your layers:
   colors, IDs, etc.

5. **Bind fetch calls** to your data filenames, and optionally adapt the UI
   text to reflect your geography.

6. **Run the server** and open your new example URL. You should see the
   morphing behaviour with working sliders, toggles, and circles.

## Notes

- The example uses modern ESM `import` statements; a bundlerless workflow is
  expected.
- No build step is required inside `examples/winchester/` – the root
  dev server serves these files directly.

---

Feel free to copy snippets from this document into other demos or README
sections. The goal is to make adding a new multi-layer morph example a
one‑hour task _(mostly data preparation)_.
