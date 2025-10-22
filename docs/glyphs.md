## Glyphs Guide

This guide covers drawing multivariate glyphs on top of morphing geometries for both Leaflet and MapLibre, including renderer options, dynamic sizing, data access, and performance.

### What is a glyph?

Glyphs are per-feature visual overlays (markers) that you render using your own HTML, SVG, Canvas, or library-generated DOM. The adapter keeps glyphs positioned and synchronized with the chosen geometry (regular, cartogram, or interpolated).

---

## Quick start

### Leaflet

```js
import { createLeafletGlyphLayer } from "geo-morpher";

const glyph = await createLeafletGlyphLayer({
  morpher,
  L,
  map,
  geometry: "interpolated",
  morphFactor: 0.25,
  drawGlyph: ({ data }) => ({
    html: `<div class="dot">${data?.population ?? ""}</div>`,
    className: "geomorpher-glyph",
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  }),
});

glyph.updateGlyphs({ morphFactor: 0.75 });
```

### MapLibre

```js
import maplibregl from "maplibre-gl";
import { createMapLibreGlyphLayer } from "geo-morpher";

const glyph = await createMapLibreGlyphLayer({
  morpher,
  map,
  maplibreNamespace: maplibregl, // pass explicitly when not on globalThis
  geometry: "cartogram",
  drawGlyph: ({ data }) => ({
    html: `<div class="badge">${data?.population ?? ""}</div>`,
    className: "geomorpher-glyph",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    markerOptions: { rotationAlignment: "map" },
  }),
});

glyph.updateGlyphs({ geometry: "interpolated", morphFactor: 0.5 });
```

---

## API overview

### Leaflet

`createLeafletGlyphLayer({ morpher, L, map?, geometry='interpolated', morphFactor=0, drawGlyph, getFeatureId?, getGlyphData?, filterFeature?, markerOptions?, pane?, scaleWithZoom=false })`

Returns a controller:
- `layer: L.LayerGroup`
- `updateGlyphs({ geometry?, morphFactor? })`
- `clear()`
- `getState(): { geometry, morphFactor, markerCount, scaleWithZoom }`
- `destroy()`

`drawGlyph(context)` may return:
- `null` to skip
- HTML string or `HTMLElement`
- `{ html?, className?, iconSize?, iconAnchor?, pane?, markerOptions?, divIconOptions? }`
- `{ icon: L.Icon }` (full control)

Context fields: `feature, featureId, data, morpher, geometry, morphFactor, zoom, featureBounds?`

### MapLibre

`createMapLibreGlyphLayer({ morpher, map, drawGlyph, morphFactor=0, geometry='interpolated', getFeatureId?, getGlyphData?, filterFeature?, markerOptions?, scaleWithZoom=false, maplibreNamespace? })`

Returns a controller:
- `updateGlyphs({ geometry?, morphFactor? })`
- `clear()`
- `getState(): { geometry, morphFactor, markerCount, scaleWithZoom }`
- `destroy()`

`drawGlyph(context)` may return:
- `null` to skip
- HTML string or `HTMLElement`
- `{ html?, element?, className?, iconSize?, iconAnchor?, markerOptions? }`

Context fields: `feature, featureId, data, morpher, geometry, morphFactor, map, zoom, featureBounds?`

Notes:
- Provide `maplibreNamespace` (e.g., `maplibregl`) in module-bundled builds where it is not on `globalThis`.
- Only a subset of Marker options are settable via methods (`setOffset`, `setRotation`, `setPitchAlignment`, `setRotationAlignment`). Others must be encoded in your DOM.

---

## Choosing a renderer

- HTML/SVG (recommended to start): simplest, fast to iterate.
- Canvas: good for sparklines or heavy micro-visuals; render then `toDataURL()` or return a prebuilt element.
- D3 or libraries: mount into a container element you create.
- Prebuilt icons (Leaflet): return `{ icon: L.icon({...}) }` for full control.

### Examples

#### 1) Pie (SVG)
```js
const drawPie = ({ data, feature }) => {
  const p = (data?.data?.properties ?? feature.properties ?? {});
  const values = [p.population, p.households].map(v => Number(v ?? 0));
  if (!values.some(v => v > 0)) return null;
  const total = values.reduce((a,b)=>a+b,0) || 1;
  let acc = 0;
  const slices = values.map((v,i)=>{
    const start = (acc/total)*2*Math.PI; acc+=v; const end=(acc/total)*2*Math.PI;
    const large = end-start > Math.PI ? 1 : 0;
    const r = 26, cx=26, cy=26;
    const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start);
    const x2 = cx + r*Math.cos(end),   y2 = cy + r*Math.sin(end);
    const colors = ["#4e79a7", "#f28e2c"]; 
    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${colors[i]}"/>`;
  }).join("");
  return { html: `<svg width="52" height="52">${slices}</svg>`, iconSize:[52,52], iconAnchor:[26,26] };
};
```

#### 2) Bar chart (SVG)
```js
const drawBars = ({ data }) => {
  const vals = [data?.population ?? 0, data?.households ?? 0].map(Number);
  const bars = vals.map((v,i)=>`<rect x="${i*20}" y="${60-v}" width="15" height="${v}" fill="steelblue"/>`).join("");
  return { html: `<svg width="60" height="60">${bars}</svg>`, iconSize:[60,60], iconAnchor:[30,30] };
};
```

#### 3) Canvas sparkline
```js
const drawSpark = ({ data }) => {
  const canvas = document.createElement("canvas");
  canvas.width = 80; canvas.height = 40;
  const ctx = canvas.getContext("2d");
  const values = data?.timeSeries ?? [];
  ctx.strokeStyle = "#4e79a7"; ctx.lineWidth = 2; ctx.beginPath();
  values.forEach((v,i)=>{const x=(i/(values.length-1))*80; const y=40-(v*40); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.stroke();
  return { html: `<img src="${canvas.toDataURL()}"/>`, iconSize:[80,40], iconAnchor:[40,20] };
};
```

#### 4) D3-driven
```js
import * as d3 from "d3";
const drawD3 = ({ data }) => {
  const div = document.createElement("div");
  div.style.width = "80px"; div.style.height = "80px";
  const svg = d3.select(div).append("svg").attr("width",80).attr("height",80);
  svg.append("circle").attr("cx",40).attr("cy",40).attr("r",20).attr("fill","#f28e2c");
  return div; // HTMLElement is accepted by both adapters
};
```

#### 5) Leaflet prebuilt icon
```js
const drawIcon = () => ({
  icon: L.icon({ iconUrl: "/markers/type.png", iconSize:[32,32], iconAnchor:[16,32] })
});
```

---

## Dynamic sizing and zoom scaling

Enable `scaleWithZoom: true` to recalculate glyphs as users zoom. When enabled, `featureBounds` provides pixel `width`, `height`, and `center` for the current feature at the current zoom.

### Leaflet example (waffle chart)
```js
const glyph = await createLeafletGlyphLayer({
  morpher, L, map,
  geometry: "interpolated",
  scaleWithZoom: true,
  drawGlyph: ({ data, featureBounds }) => {
    if (!featureBounds) return null;
    const { width, height } = featureBounds;
    const grid = 10;
    const cell = Math.min(width, height) / grid;
    const fillRatio = (data?.value ?? 0)/(data?.max ?? 1);
    const filled = Math.floor(grid*grid*fillRatio);
    const cells = [];
    for (let i=0;i<grid;i++) for (let j=0;j<grid;j++) {
      const idx = i*grid+j;
      const on = idx < filled;
      cells.push(`<rect x="${j*cell}" y="${i*cell}" width="${cell}" height="${cell}" fill="${on?"#4e79a7":"#e0e0e0"}"/>`);
    }
    return { html: `<svg width="${width}" height="${height}">${cells.join("")}</svg>`, iconSize:[width,height], iconAnchor:[width/2,height/2] };
  },
});
```

### MapLibre example (waffle chart)
```js
const glyph = await createMapLibreGlyphLayer({
  morpher, map, maplibreNamespace: maplibregl,
  scaleWithZoom: true,
  drawGlyph: ({ data, featureBounds }) => {
    if (!featureBounds) return null;
    const { width, height } = featureBounds;
    const grid = 10;
    const cell = Math.min(width, height) / grid;
    const fillRatio = (data?.value ?? 0)/(data?.max ?? 1);
    const filled = Math.floor(grid*grid*fillRatio);
    const cells = [];
    for (let i=0;i<grid;i++) for (let j=0;j<grid;j++) {
      const idx = i*grid+j;
      const on = idx < filled;
      cells.push(`<rect x="${j*cell}" y="${i*cell}" width="${cell}" height="${cell}" fill="${on?"#4e79a7":"#e0e0e0"}"/>`);
    }
    return { html: `<svg width="${width}" height="${height}">${cells.join("")}</svg>`, iconSize:[width,height], iconAnchor:[width/2,height/2] };
  },
});
```

Tips:
- Guard for very small `featureBounds` and return `null` to skip tiny glyphs.
- For fixed-size markers, keep `scaleWithZoom: false` and use constant `iconSize`/`iconAnchor`.

---

## Data access and filtering

By default, `data` is populated from `morpher.getKeyData()` keyed by `featureId` (defaults to `feature.properties.code ?? feature.properties.id`).

Customize data or visibility:

```js
const glyph = await createLeafletGlyphLayer({
  morpher, L, map,
  getGlyphData: ({ featureId }) => externalStats[featureId],
  filterFeature: ({ data }) => (data?.population ?? 0) > 0,
  drawGlyph,
});
```

You can also change the geometry source at any time:

```js
glyph.updateGlyphs({ geometry: "regular" });
glyph.updateGlyphs({ geometry: "interpolated", morphFactor: 0.6 });
```

---

## Marker options and styling

### Leaflet
- Use `pane` to control z-index stacking of glyphs.
- `markerOptions` and `divIconOptions` pass through to Leaflet.
- Return `{ icon: L.Icon }` when you need total control over icon rendering.

### MapLibre
- Only certain options are settable via marker methods; rely on DOM CSS for most styling.
- `iconSize` and `iconAnchor` translate to element size and computed `offset`.
- If `maplibregl` isn’t on `globalThis`, pass `maplibreNamespace`.

---

## Performance

- Keep glyph DOM light; prefer SVG over deeply nested HTML.
- Reuse DOM where possible; the adapters update existing markers when your `drawGlyph` returns compatible results.
- Skip tiny or offscreen features by returning `null` from `drawGlyph`.
- MapLibre: For thousands of glyphs, consider a `CustomLayerInterface` that batches drawing on the GPU; the marker-based approach is simple but not optimal at very high counts.

---

## Troubleshooting

- Glyphs not appearing: confirm `morpher.prepare()` has run; ensure `featureId` resolves and `drawGlyph` doesn’t return `null`.
- Misaligned icons: check `iconAnchor`; for centered glyphs, use `[width/2, height/2]`.
- Nothing updates on zoom: verify `scaleWithZoom: true` and that your `drawGlyph` uses `featureBounds`.

---

## See also

- `examples/leaflet/zoom-scaling-glyphs.html` for a complete zoom-scaling demo
- `README.md` sections on glyphs for quick examples
- MapLibre CustomLayerInterface for advanced GPU rendering


