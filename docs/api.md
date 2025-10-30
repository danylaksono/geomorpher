## geo-morpher API Reference

This document expands on the README by describing each public export in depth, outlining the lifecycle needed to build your own morphing experience, and highlighting practical considerations when integrating GeoMorpher into custom projects.

---

### Implementation overview and workflow

1. **Collect aligned geodata**: obtain two GeoJSON FeatureCollections representing the same places—one “regular” geography and one cartogram. Ensure every feature contains a unique identifier at `feature.properties[geoJSONJoinColumn]`.
2. **Prepare your metrics**: load tabular data keyed by the same identifier. Use the `data` array for preloaded rows, or supply `getData` when you need to fetch lazily.
3. **Instantiate `GeoMorpher`** with the appropriate options (projection, aggregations, normalisation). See the detailed section below.
4. **Await `morpher.prepare()` once** during application start-up. This normalises the cartogram, enriches properties, computes centroids, and builds ring interpolators.
5. **Render baseline layers** using `getRegularFeatureCollection()` and `getCartogramFeatureCollection()` or defer to an adapter to create them on the map for you.
6. **Drive morphing** by calling `getInterpolatedFeatureCollection(factor)` directly or by invoking an adapter controller’s `updateMorphFactor` method from your UI.
7. **Attach glyphs or annotations** with the glyph helpers. They use the same morph factor to remain aligned with geometry.

---

### Core API

#### `class GeoMorpher`

```js
import { GeoMorpher } from "geo-morpher";

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  data,
  getData,
  joinColumn: "lsoa",
  geoJSONJoinColumn: "code",
  aggregations: { population: "sum" },
  normalize: true,
  projection: WGS84Projection,
  cartogramGridOptions: {},
});

await morpher.prepare();
```

**Constructor options**
- `regularGeoJSON` *(required)*: FeatureCollection representing the baseline geography. GeoMorpher clones it internally to avoid mutation side effects.
- `cartogramGeoJSON` *(required)*: FeatureCollection representing the cartogram (distorted) version. Rings may differ but must share the same identifiers.
- `data`: Array of plain objects keyed by `joinColumn`. Use this when your indicators are already in memory.
- `getData`: Async function returning an array of rows. Ideal for fetching from APIs or running preprocessing steps. Ignored when `data` is provided.
- `joinColumn`: Property name on each data row used to join with GeoJSON features. Defaults to `"lsoa"` (legacy dataset convention).
- `geoJSONJoinColumn`: Feature property used for the join (default `"code"`). Must exist on both regular and cartogram collections.
- `aggregations`: Object describing how to roll up numeric fields when multiple data rows map to the same feature. Supported keys mirror the enrichment helpers (`sum`, `mean`, `min`, `max`, `count`, `collect`).
- `normalize`: When `true`, GeoMorpher normalises aggregated values by polygon area to keep metrics comparable after morphing.
- `projection`: Projection helper that exposes `toGeo([x, y]) => [lng, lat]`. Defaults to an OSGB transformer; override with `WGS84Projection`, `WebMercatorProjection`, or a custom proj4 wrapper.
- `cartogramGridOptions`: Options forwarded to `normalizeCartogramInput`. Use when your cartogram input is a grid or waffle that needs to be converted to polygons.

**Lifecycle**
- `await morpher.prepare()`: loads `data` or `getData`, enriches features, normalises the cartogram if necessary, projects coordinates to WGS84, computes centroids, and builds interpolator functions. Subsequent calls resolve immediately.
- `morpher.isPrepared()`: returns `true` once `prepare()` completes. Adapters call this automatically but it is useful when orchestrating your own lifecycle.

**Data accessors**
- `morpher.getRegularFeatureCollection()`: returns a WGS84 FeatureCollection representing the baseline geography (deep cloned on each call).
- `morpher.getCartogramFeatureCollection()`: same for the cartogram geometry.
- `morpher.getInterpolatedFeatureCollection(factor)`: returns a FeatureCollection interpolated between the two inputs. `factor` is clamped to `[0, 1]`, and each feature will include a `morph_factor` property plus a computed centroid.
- `morpher.getGeographyLookup()` / `morpher.getCartogramLookup()`: return plain objects keyed by feature code for O(1) access.
- `morpher.getInterpolatedLookup(factor)`: keyed lookup for tweened geometries (handy when glyphs need direct access without re-filtering the FeatureCollection).
- `morpher.getKeyData()`: returns `{ [code]: { code, population, data } }`, giving you easy access to enriched metrics for tooltips or glyphs.

**Implementation notes**
- GeoMorpher duplicates and annotates features with centroids so that glyph helpers do not need to recalculate them.
- When a polygon exists in only one geography, placeholder rings are generated to keep interpolation stable rather than collapsing immediately.
- All outputs are safe to mutate in the calling code because clones are returned. The internal cache remains immutable.

#### Data enrichment details

The enrichment pipeline inside `utils/enrichment.js` resolves joins using `joinColumn` ↔ `geoJSONJoinColumn`. Aggregations run per feature; for example:

```js
aggregations: {
  population: "sum",
  households: "sum",
  density: (values, feature) => values.reduce((acc, val) => acc + val, 0) / feature.area,
}
```

Custom aggregation functions receive the list of numeric values for a feature and the enriched GeoJSON feature. Use this hook for domain-specific computations. If you disable `normalize`, raw sums are preserved. When normalisation is enabled, aggregated values are adjusted by feature area—which is useful for density-driven cartograms but may not fit every dataset.

#### Error handling

- Constructor validation ensures both GeoJSON inputs are provided.
- `prepare()` throws if data loading fails or a join key is missing. Wrap it in a `try/catch` block during bootstrapping so you can surface descriptive errors to end-users.
- Accessors call `assertPrepared()` internally. If you forget to await `prepare()`, you will receive a descriptive runtime error.

#### Legacy wrapper

`geoMorpher(options)` is a convenience async function retained for the Observable notebook workflow. It simply instantiates `GeoMorpher`, awaits `prepare()`, and resolves to:

```js
{
  morpher,
  keyData,
  regularGeodataLookup,
  regularGeodataWgs84,
  cartogramGeodataLookup,
  cartogramGeodataWgs84,
  tweenLookup,
}
```

New projects should prefer `new GeoMorpher(...)` for clearer lifecycle control.

---

### Adapter APIs

Adapters translate GeoMorpher outputs into the mapping primitives expected by MapLibre and Leaflet. Each adapter is asynchronous and will trigger `morpher.prepare()` if it has not yet run.

#### MapLibre – `createMapLibreMorphLayers(params): Promise<Controller>`

Purpose:
- Create three GeoJSON sources (`regular`, `cartogram`, `interpolated`).
- Add fill layers using sensible default colours (blue/orange/green) unless overridden.
- Provide a controller for updating morph factors, toggling layers, applying basemap effects, and removing resources.

Parameters:
- `morpher` *(required)*: prepared or unprepared `GeoMorpher` instance.
- `map` *(required)*: `maplibregl.Map` instance.
- `morphFactor` *(default `0`)*: initial mix between regular and cartogram features.
- `idBase` *(default `"geomorpher"`)*: prefix applied to generated source and layer ids.
- `regularStyle`, `cartogramStyle`, `interpolatedStyle`: partial layer definitions merged onto defaults. Provide overrides for paint/layout properties, filters, metadata, `minzoom`, or `maxzoom`.
- `beforeId`: layer id to insert the generated layers before.
- `basemapEffect`: configuration object for animating existing basemap layers during morphing.

Controller surface:
- `updateMorphFactor(next: number)`: recompute the interpolated FeatureCollection, update the tween source, apply the basemap effect, and call `map.triggerRepaint?.()`. Returns the new FeatureCollection.
- `setLayerVisibility({ regular, cartogram, interpolated })`: accept booleans or MapLibre visibility strings (`"visible"` / `"none"`).
- `applyBasemapEffect(factor: number)`: manually apply the basemap effect—useful for custom animation loops.
- `remove()`: remove generated layers/sources and reset any modified paint properties.
- `getState()`: inspect `{ sourceIds, layerIds, morphFactor }`.

Basemap effect schema:
- `layers`: string, array, or resolver function returning layer ids (executed each time the effect runs).
- `properties`: map of paint properties to `[from, to]`, `{ from, to }`, single numbers (target values), or functions receiving `{ layerId, property, factor, original, map }`.
- `layerProperties`: per-layer overrides merged with `properties`.
- `propertyClamp` / `clamp`: enforce `[min, max]` bounds per property or globally.
- `propertyTransforms`: hook for final value massaging (e.g., returning arrays for colour ramps).
- `easing(factor)`: custom easing curve (defaults to identity).
- `isEnabled(ctx)`: toggle effect per frame; receives `{ factor, easedFactor, map }`.
- `resetOnDisable`: whether to restore original values when `isEnabled` is false (default `true`).

Keep in mind: initialise this adapter after the MapLibre map emits `load` so that source/layer creation succeeds.

#### MapLibre – `createMapLibreGlyphLayer(params): Promise<GlyphController>`

Purpose:
- Place DOM-based glyphs (`maplibregl.Marker`) that remain anchored to morphing features.
- Optionally rescale glyphs as users zoom (`scaleWithZoom`).

Key parameters:
- `morpher` *(required)* and `map` *(required)*.
- `drawGlyph(context)` *(required)*: returns an HTML string, `HTMLElement`, or object `{ element, className, iconSize, iconAnchor, markerOptions }`. The `context` includes `feature`, `featureId`, `geometry`, `morphFactor`, `data`, `morpher`, `map`, `zoom`, and optional `featureBounds` when `scaleWithZoom` is `true`.
- `morphFactor`: initial value when `geometry` is `'interpolated'`.
- `geometry`: `'regular'`, `'cartogram'`, `'interpolated'`, or resolver function.
- `getGlyphData(context)`: hook to return custom payloads per feature.
- `filterFeature(context)`: return `false` to skip glyph creation.
- `markerOptions`: default marker options (offset, rotation alignment, etc.). Only options with dedicated setter methods can be updated after creation.
- `scaleWithZoom`: automatically recompute glyphs on `zoomend`.
- `maplibreNamespace`: pass your `maplibregl` import when it is not attached to `globalThis`.

Controller surface:
- `updateGlyphs({ geometry, morphFactor })`: recompute glyphs and return `{ geometry, morphFactor, featureCount }`.
- `clear()`: remove all markers.
- `getState()`: inspect current geometry, morph factor, marker count, and `scaleWithZoom` flag.
- `destroy()`: clear markers and detach `zoomend` listeners.

Tips:
- Store references to created markers if you need to attach interactivity beyond the default non-interactive state. Return `{ markerOptions: { interactive: true } }` when building glyphs for user input.
- Stick to lightweight DOM/SVG glyphs for performance. For heavy scenes (thousands of glyphs), consider migrating to a MapLibre CustomLayerInterface that batches rendering on the GPU.

#### Leaflet – `createLeafletMorphLayers(params)`

Purpose:
- Create three `L.geoJSON` layers (regular, tween, cartogram) and group them in a single `L.LayerGroup`.
- Optionally apply DOM-based blur, opacity, grayscale, or brightness adjustments to a Leaflet basemap tile container during morphing.

Parameters:
- `morpher`, `L` *(required)*.
- `morphFactor`: initial blend.
- `regularStyle`, `cartogramStyle`, `tweenStyle`: standard Leaflet style callbacks (`(feature) => style`).
- `onEachFeature`: hook for attaching tooltips/popups or event handlers.
- `basemapLayer`: Leaflet layer whose container should receive CSS filter adjustments.
- `basemapEffect`: object supporting `blurRange`, `opacityRange`, `grayscaleRange`, `brightnessRange`, `isEnabled`, `target`, or `pane`. Ranges accept `[start, end]`, `{ from, to }`, or single numbers interpreted as the end value.

Return value:

```js
{
  group,
  regularLayer,
  cartogramLayer,
  tweenLayer,
  updateMorphFactor,
}
```

`updateMorphFactor(next)` replaces features inside the tween layer and reapplies the basemap effect with the new factor.

#### Leaflet – `createLeafletGlyphLayer(params)`

- Mirrors the MapLibre glyph helper but returns Leaflet primitives.
- `drawGlyph` can return an HTML string, `HTMLElement`, `{ html, className, iconSize, iconAnchor, pane, markerOptions, divIconOptions }`, or `{ icon: L.Icon }` when you want full control over the icon.
- Respect `scaleWithZoom` by using `featureBounds` (pixel width/height at the current zoom). The helper fires on `zoomend`, so pair it with throttled animations if needed.
- Remember to call `destroy()` when tearing down the layer to remove zoom listeners and clear markers.

---

### Utility exports (`src/index.js`)

- `WGS84Projection`: identity `toGeo` function. Use when your GeoJSON is already in latitude/longitude.
- `WebMercatorProjection`: converts EPSG:3857 X/Y values to WGS84.
- `isLikelyWGS84(geojson)`: heuristic returning `'WGS84'`, `'OSGB'`, or `'UNKNOWN'`. Use it to decide which projection helper to pass to `GeoMorpher`.
- `createProj4Projection(projDefinition)`: Node-only helper that wraps `proj4` and returns `{ toGeo }`. Throws if `proj4` is unavailable or you call it in the browser.
- `parseCSV(text)`: lightweight CSV parser that yields an array of objects keyed by column name—convenient for transforming statistical tables before enrichment.
- `createGridCartogramFeatureCollection(...)` and `normalizeCartogramInput(...)`: helpers for turning waffle/grid cartogram inputs into FeatureCollections GeoMorpher can consume.

---

### Integration patterns

#### MapLibre with vanilla controls

```js
import maplibregl from "maplibre-gl";
import {
  GeoMorpher,
  createMapLibreMorphLayers,
  createMapLibreGlyphLayer,
} from "geo-morpher";

const morpher = new GeoMorpher({ regularGeoJSON, cartogramGeoJSON, data, aggregations });
await morpher.prepare();

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-1.2577, 51.752],
  zoom: 11,
});

await map.once("load");

const morphController = await createMapLibreMorphLayers({
  morpher,
  map,
  basemapEffect: {
    layers: ["basemap"],
    properties: { "raster-opacity": [1, 0.15] },
    easing: (t) => t * t,
  },
});

const glyphController = await createMapLibreGlyphLayer({
  morpher,
  map,
  geometry: "interpolated",
  drawGlyph: ({ data }) => ({
    html: `<div class="metric">${Math.round(data?.population ?? 0)}</div>`,
    className: "geomorpher-glyph",
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  }),
});

const slider = document.querySelector("#morph-slider");
slider.addEventListener("input", (event) => {
  const factor = Number(event.target.value) / 100;
  morphController.updateMorphFactor(factor);
  glyphController.updateGlyphs({ morphFactor: factor });
});
```

#### React + Leaflet

- Instantiate `GeoMorpher` inside a `useEffect` hook and store the prepared instance in state.
- Call `createLeafletMorphLayers` inside another effect once the Leaflet map is ready; keep the returned controller in a ref.
- Update morph factors on slider changes by calling `controller.updateMorphFactor(value)`.
- Clean up controllers on component unmount (`controller.group.remove()`, `glyphController.destroy()`).

---

### Testing and validation

- Run `npm test` to execute Node-based smoke tests covering interpolation behaviour.
- Snapshot `getInterpolatedFeatureCollection` outputs at key morph factors if you customise enrichment or cartogram preprocessing.
- Use the examples under `examples/` with `npm run examples:browser` to verify rendering in a real browser environment.

---

### Troubleshooting checklist

- **Morph jumps or tears**: Confirm that both GeoJSON files contain identical join keys and that polygons have consistent winding. Use `normalizeCartogramInput` when working with grid cartograms.
- **Missing enrichment values**: Log `morpher.getKeyData()` after `prepare()` and ensure your dataset’s `joinColumn` matches the GeoJSON property.
- **Basemap effects not applied**: Inspect `map.getStyle().layers` (MapLibre) or the DOM element returned by `basemapEffect.target` (Leaflet) to confirm the target exists. Remember that dynamically added MapLibre layers will not be captured unless you re-initialise the controller or update `layers`.
- **Glyphs lagging**: Avoid heavy work inside `drawGlyph`; precompute expensive metrics with `getGlyphData`. For MapLibre, prefer CSS transitions over JavaScript-driven layout adjustments when animating glyph internals.
- **Projection artefacts**: Run `isLikelyWGS84(geojson)` before instantiating the morpher and pass an explicit projection to prevent double transforms.

---

### Glossary

- **Morph factor**: Continuous value between `0` (regular geometry) and `1` (cartogram). All interpolation and basemap effects reference this scalar.
- **Lookup**: Plain object keyed by feature identifier, returning either geometry or enriched data—handy for tooltip and glyph resolution.
- **Glyph**: Custom visual overlay (HTML, SVG, Canvas) anchored to a feature’s centroid or bounds.
- **Basemap effect**: Optional visual treatment applied to non-morph layers (blur, fade, brighten) to focus attention on the morphing layer.

Consult `docs/glyphs.md` for a deeper dive into glyph authoring techniques and performance guidance. For roadmap updates and adapter caveats, see the README status section and the project issue tracker.


