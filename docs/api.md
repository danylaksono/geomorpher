## geo-morpher API Reference

### Core

#### `class GeoMorpher`
- Constructor options:
  - `regularGeoJSON`: GeoJSON FeatureCollection (required)
  - `cartogramGeoJSON`: GeoJSON FeatureCollection (required; can be normalized from grids via `normalizeCartogramInput`)
  - `data`: Array of model rows to enrich features, or use `getData`
  - `getData`: Async function returning model rows
  - `joinColumn`: String, data key to join on (default: `"lsoa"`)
  - `geoJSONJoinColumn`: String, feature property to join on (default: `"code"`)
  - `aggregations`: Object of aggregators per field (e.g., `{ population: "sum" }`)
  - `normalize`: Boolean, normalize aggregated values (default: `true`)
  - `projection`: Projection object with `toGeo([x,y]) => [lng,lat]` (default: OSGB)
  - `cartogramGridOptions`: Options for grid-normalizing cartogram inputs

- Methods:
  - `prepare(): Promise<this>`
  - `isPrepared(): boolean`
  - `getKeyData(): Record<string, { code: string, population: number, data: Feature }>`
  - `getRegularFeatureCollection(): FeatureCollection`
  - `getCartogramFeatureCollection(): FeatureCollection`
  - `getGeographyLookup(): Record<string, Feature>`
  - `getCartogramLookup(): Record<string, Feature>`
  - `getInterpolatedFeatureCollection(factor: number): FeatureCollection`
  - `getInterpolatedLookup(factor: number): Record<string, Feature>`

#### Legacy wrapper
- `geoMorpher(options): Promise<{ morpher, keyData, regularGeodataLookup, regularGeodataWgs84, cartogramGeodataLookup, cartogramGeodataWgs84, tweenLookup }>`

### Utilities (exports from `src/index.js`)
- `WGS84Projection`, `WebMercatorProjection`, `isLikelyWGS84(geojson): 'WGS84' | 'OSGB' | 'UNKNOWN'`
- `createProj4Projection(projDefinition: string)` (Node.js only; requires `proj4`)
- `parseCSV(text: string): Array<Record<string,string>>`
- `createGridCartogramFeatureCollection(...)` and `normalizeCartogramInput(...)`

### Adapters — MapLibre (default)

#### `createMapLibreMorphLayers(params): Promise<Controller>`
- Params:
  - `morpher`: prepared `GeoMorpher` instance (required)
  - `map`: `maplibregl.Map` (required)
  - `morphFactor`: number (default `0`)
  - `idBase`: string for source/layer ids (default `"geomorpher"`)
  - `regularStyle`, `cartogramStyle`, `interpolatedStyle`: partial MapLibre layer specs
  - `beforeId`: layer id to insert before
  - `basemapEffect`: see Basemap Effects (MapLibre)

- Returns Controller:
  - `updateMorphFactor(next: number): FeatureCollection`
  - `setLayerVisibility({ regular?: boolean | 'visible'|'none', cartogram?: boolean | 'visible'|'none', interpolated?: boolean | 'visible'|'none' }): void`
  - `applyBasemapEffect(factor: number): void`
  - `remove(): void`
  - `getState(): { sourceIds, layerIds, morphFactor }`

#### Basemap Effects (MapLibre)
- `basemapEffect` supports:
  - `layers`: string | string[] | ({ map }) => string[]
  - `properties`: Record<paintProperty, range | {from,to} | (ctx) => any>
  - `layerProperties`: Record<layerId, Record<paintProperty, ...>>
  - `propertyClamp`: Record<paintProperty, [min,max]>
  - `propertyTransforms`: Record<paintProperty, ({ value, factor, original, layerId, map }) => any>
  - `clamp`: [min,max] (global)
  - `easing(factor): number`
  - `isEnabled(ctx): boolean`
  - `resetOnDisable`: boolean (default true)

#### `createMapLibreGlyphLayer(params): Promise<GlyphController>`
- Params:
  - `morpher`: prepared `GeoMorpher` (required)
  - `map`: `maplibregl.Map` (required)
  - `drawGlyph(context)`: returns HTML string | HTMLElement | { html?, element?, className?, iconSize?, iconAnchor?, markerOptions? }
  - `morphFactor`: number (default `0`)
  - `geometry`: `'regular' | 'cartogram' | 'interpolated' | (ctx)=>string`
  - `getFeatureId(feature)`: defaults to `feature.properties.code ?? feature.properties.id`
  - `getGlyphData(ctx)`
  - `filterFeature(ctx): boolean`
  - `markerOptions`: MapLibre Marker options (subset applied via setters)
  - `scaleWithZoom`: boolean (default `false`)
  - `maplibreNamespace`: override for `maplibregl` if not on `globalThis`

- Returns GlyphController:
  - `updateGlyphs({ geometry?, morphFactor? }): { geometry, morphFactor, featureCount }`
  - `clear(): void`
  - `getState(): { geometry, morphFactor, markerCount, scaleWithZoom }`
  - `destroy(): void`

### Adapters — Leaflet (compat)

#### `createLeafletMorphLayers(params): Promise<{ group, regularLayer, cartogramLayer, tweenLayer, updateMorphFactor }>`
- Params:
  - `morpher`: prepared `GeoMorpher` (required)
  - `L`: Leaflet namespace (required)
  - `morphFactor`: number (default `0`)
  - `regularStyle`, `cartogramStyle`, `tweenStyle`: `(feature) => style`
  - `onEachFeature(feature, layer)`
  - `basemapLayer`: Leaflet layer or target element
  - `basemapEffect`: { blurRange?, opacityRange?, grayscaleRange?, brightnessRange?, isEnabled? }

#### `createLeafletGlyphLayer(params): Promise<GlyphController>`
- Params:
  - `morpher`, `L` (required); `map` optional
  - `geometry`, `morphFactor`
  - `drawGlyph(context)` returns: HTML string | HTMLElement | { html?, className?, iconSize?, iconAnchor?, pane?, markerOptions?, divIconOptions? } | { icon: L.Icon }
  - `getFeatureId(feature)`; `getGlyphData(ctx)`; `filterFeature(ctx)`; `markerOptions`; `pane`; `scaleWithZoom`

- Returns GlyphController:
  - `layer: L.LayerGroup`
  - `updateGlyphs({ geometry?, morphFactor? })`
  - `clear()`
  - `getState(): { geometry, morphFactor, markerCount, scaleWithZoom }`
  - `destroy()`

### Aliases
- `createMorphLayers` → `createMapLibreMorphLayers`
- `createGlyphLayer` → `createMapLibreGlyphLayer`

### Types and Contracts
- `drawGlyph(context)` context includes:
  - `feature`, `featureId`, `morpher`, `geometry`, `morphFactor`, `data`
  - Map adapter specifics: Leaflet adds `zoom` and optional `featureBounds`; MapLibre adds `map`, `zoom`, and optional `featureBounds`

### Example Snippets

```js
// Core
const morpher = new GeoMorpher({ regularGeoJSON, cartogramGeoJSON, data, aggregations });
await morpher.prepare();
const tween = morpher.getInterpolatedFeatureCollection(0.5);
```

```js
// MapLibre morph layers
const ctl = await createMapLibreMorphLayers({ morpher, map, basemapEffect: { layers: ['basemap'], properties: { 'raster-opacity': [1, 0.1] } } });
ctl.updateMorphFactor(0.75);
```

```js
// Leaflet glyphs
const glyphs = await createLeafletGlyphLayer({ morpher, L, map, drawGlyph: ({ data }) => ({ html: `<div>${data?.population ?? ''}</div>` }) });
glyphs.updateGlyphs({ morphFactor: 0.5 });
```


