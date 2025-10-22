# Examples

These examples are split by adapter. MapLibre is the default; Leaflet is provided for compatibility.

## Structure

- `examples/maplibre/` – MapLibre GL JS demos (default)
- `examples/leaflet/` – Leaflet demos (compatibility)

## Run

```bash
npm run examples:browser
```

Open in your browser:

### MapLibre
- `http://localhost:4173/examples/maplibre/index.html`
- `http://localhost:4173/examples/maplibre/indonesia/index.html`
- `http://localhost:4173/examples/maplibre/projections/index.html`

### Leaflet
- `http://localhost:4173/examples/leaflet/index.html`
- `http://localhost:4173/examples/leaflet/zoom-scaling-glyphs.html`

## Import maps

All examples use import maps. Ensure the following mappings (adjust as needed):

```html
<script type="importmap">
{
  "imports": {
    "leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm",
    "npm:leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm",
    "maplibre-gl": "https://esm.sh/maplibre-gl@5.8.0?bundle",
    "@turf/turf": "https://esm.sh/@turf/turf@6.5.0?bundle",
    "@turf/helpers": "https://esm.sh/@turf/helpers@6.5.0?bundle",
    "flubber": "https://esm.sh/flubber@0.4.2?bundle",
    "lodash/isEmpty.js": "https://esm.sh/lodash@4.17.21/isEmpty?bundle",
    "lodash/cloneDeep.js": "https://esm.sh/lodash@4.17.21/cloneDeep?bundle",
    "lodash/keyBy.js": "https://esm.sh/lodash@4.17.21/keyBy?bundle",
    "lodash/mapValues.js": "https://esm.sh/lodash@4.17.21/mapValues?bundle"
  }
}
</script>
```

Notes:
- `@turf/turf` and `flubber` must use esm.sh with `?bundle`.
- Leaflet works with jsDelivr `+esm`.
- Raw Node examples have been converted; all demos are browser-based.
