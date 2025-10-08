# Browser Examples

This directory contains browser-based examples that demonstrate geo-morpher features without requiring a build step.

## Examples

### 1. `index.html` - Main Demo
The primary demonstration showing:
- Morphing between regular and cartogram geometries
- Pie chart glyphs
- Basemap effects
- Layer controls

### 2. `zoom-scaling-glyphs.html` - Zoom-Scaling Demo
Demonstrates the zoom-scaling feature with:
- Waffle charts that resize with map zoom
- Toggle between fixed and scaling modes
- Interactive controls

## Running the Examples

```bash
npm run examples:browser
```

Then open:
- Main demo: http://localhost:4173/examples/browser/index.html
- Zoom-scaling: http://localhost:4173/examples/browser/zoom-scaling-glyphs.html

## Important: Import Maps

All browser examples use **import maps** to resolve module dependencies from CDN without a build step. When creating new examples, ensure you include ALL required modules in the import map.

### Complete Import Map Template

For future browser examples, use this complete template:

```html
<script type="importmap">
{
  "imports": {
    "leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm",
    "npm:leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm",
    "@turf/turf": "https://esm.sh/@turf/turf@6.5.0?bundle",
    "flubber": "https://esm.sh/flubber@0.4.2?bundle",
    "lodash/isEmpty.js": "https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/isEmpty.js",
    "lodash/cloneDeep.js": "https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/cloneDeep.js",
    "lodash/keyBy.js": "https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/keyBy.js",
    "lodash/mapValues.js": "https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/mapValues.js"
  }
}
</script>
```

**Critical notes:**
- ⚠️ **`@turf/turf` and `flubber` MUST use esm.sh with `?bundle` parameter**
- ✅ Leaflet works with jsDelivr's `+esm` transform  
- ✅ Lodash modules work with either CDN

### Required Dependencies

**Core dependencies:**
- **Leaflet 1.9.4** - Mapping library
- **@turf/turf 6.5.0** - Geospatial analysis (⚠️ requires esm.sh with ?bundle)
- **flubber 0.4.2** - Shape interpolation for morphing (⚠️ requires esm.sh with ?bundle)
- **lodash-es 4.17.21** - Utility functions (4 modules: isEmpty, cloneDeep, keyBy, mapValues)

### Finding Required Modules

If you get an error like:
```
Uncaught TypeError: Failed to resolve module specifier "xxx"
```

1. Search the codebase for all imports:
   ```bash
   # Find all external imports in source files
   grep -rh "^import" src/ | grep -E "from ['\"]" | grep -v "from ['\"]\./" | grep -v "from ['\"]\.\." | sort -u
   
   # Or specifically for lodash:
   grep -r "from \"lodash/" src/
   
   # Or for a specific module:
   grep -r "from \"flubber\"" src/
   ```

2. Add any missing modules to your import map

### CDN Configuration Guide

**⚠️ Important: Different packages require different CDNs**

**flubber and @turf/turf - MUST use esm.sh with ?bundle:**
```javascript
"@turf/turf": "https://esm.sh/@turf/turf@6.5.0?bundle",
"flubber": "https://esm.sh/flubber@0.4.2?bundle"
```

**Why?** These packages have complex dependency trees. The `?bundle` parameter tells esm.sh to bundle all dependencies into a single module file. Without it, you'll get `Cannot read properties of null` errors.

**Leaflet - Use jsDelivr with +esm:**
```javascript
"leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm",
"npm:leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm"
```

**Lodash - Either CDN works:**
```javascript
// jsDelivr (simpler URLs, recommended)
"lodash/keyBy.js": "https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/keyBy.js"

// esm.sh (with bundle flag)
"lodash/keyBy.js": "https://esm.sh/lodash@4.17.21/keyBy?bundle"
```

## Troubleshooting

### "Cannot read properties of null (reading 'interpolate')"

**Problem:** `TypeError: Cannot read properties of null (reading 'interpolate')` at geomorpher.js

**Solution:** This means `flubber` is not loading correctly. Ensure you're using esm.sh with the `?bundle` parameter:
```javascript
"flubber": "https://esm.sh/flubber@0.4.2?bundle"
```

NOT jsDelivr:
```javascript
"flubber": "https://cdn.jsdelivr.net/npm/flubber@0.4.2/+esm"  // ❌ Will not work!
```

### Module Resolution Errors

**Problem:** `Failed to resolve module specifier "xxx"`

**Solution:** Add the missing module to the import map (see template above)

### 404 Errors for Favicon

**Problem:** `Failed to load resource: 404 (Not Found)` for favicon.ico

**Solution:** This is harmless - browsers automatically request favicon.ico. You can ignore it or add a favicon to the examples/browser directory.

### Import Map Not Working

**Problem:** Modules still not resolving after adding to import map

**Solution:** 
1. Clear browser cache (hard reload with Ctrl+Shift+R or Cmd+Shift+R)
2. Check browser console for syntax errors in import map JSON
3. Ensure import map script tag comes BEFORE the module script tag
4. Verify all JSON is properly formatted (no trailing commas, proper quotes)

## Browser Compatibility

Import maps are supported in:
- Chrome/Edge 89+
- Firefox 108+
- Safari 16.4+

For older browsers, consider using a build tool or import map polyfill.

## Adding New Examples

When creating a new example:

1. Copy the complete import map template from above
2. Ensure you use esm.sh for flubber and @turf/turf
3. Test in browser and check console for errors
4. Add documentation to this README
