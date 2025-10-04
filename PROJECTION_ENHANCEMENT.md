# Projection Support Enhancement

## Summary

Enhanced `geo-morpher` to support **arbitrary coordinate systems** beyond OSGB (British National Grid).

## Changes Made

### 1. Core Changes

**File: `src/core/geomorpher.js`**
- Added `projection` parameter to constructor
- Passes projection to `toWGS84FeatureCollection()` for custom coordinate transformations

**File: `src/utils/projection.js`**
- Enhanced `toWGS84FeatureCollection()` to handle `null` projection gracefully
- Falls back to DEFAULT_PROJECTION (OSGB) when projection is not provided

### 2. New Utilities

**File: `src/utils/projections.js`** (NEW)
- `WGS84Projection` - Identity projection for data already in lat/lng
- `WebMercatorProjection` - Support for EPSG:3857 (web map tiles)
- `isLikelyWGS84()` - Auto-detect coordinate system from GeoJSON
- `createProj4Projection()` - Helper for proj4-based transformations

### 3. Documentation

**File: `PROJECTIONS.md`** (NEW)
- Comprehensive guide on using custom projections
- Common projection examples (WGS84, UTM, Web Mercator)
- Troubleshooting guide
- API reference

**File: `README.md`**
- Added "Using custom projections" section
- Examples for WGS84 and Web Mercator
- Reference to detailed documentation

### 4. Examples

**File: `examples/custom-projection.js`** (NEW)
- Example 1: WGS84 data (US states)
- Example 2: OSGB data (default behavior)
- Example 3: Custom projection (UTM approximation)

## Usage

### For WGS84 Data (Most Common)

```javascript
import { GeoMorpher, WGS84Projection } from "geo-morpher";

const morpher = new GeoMorpher({
  regularGeoJSON,      // Already in lat/lng
  cartogramGeoJSON,
  projection: WGS84Projection,
});
```

### For OSGB Data (Backward Compatible)

```javascript
import { GeoMorpher } from "geo-morpher";

const morpher = new GeoMorpher({
  regularGeoJSON,      // OSGB coordinates
  cartogramGeoJSON,
  // No projection parameter = uses OSGB (default)
});
```

### For Other Projections

```javascript
const myProjection = {
  toGeo: ([x, y]) => [lng, lat]  // Your transformation
};

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: myProjection,
});
```

## Testing

All existing tests pass:
```bash
npm test
# ✔ GeoMorpher prepares enriched collections
# ✔ geoMorpher legacy wrapper returns structured result
# ✔ Leaflet helper produces layer group
# ✔ Glyph layer renders markers and updates with morph factor
```

New example runs successfully:
```bash
node examples/custom-projection.js
```

## Backward Compatibility

✅ **100% backward compatible**
- Existing code continues to work without changes
- Default behavior unchanged (OSGB projection)
- All tests pass
- No breaking changes to API

## Benefits

1. **Global Applicability**: Use with any coordinate system worldwide
2. **Flexible**: Support for standard projections (WGS84, Web Mercator) and custom ones
3. **Auto-detection**: Helper function to identify coordinate systems
4. **Well Documented**: Comprehensive guide with examples
5. **Type Safe**: Clear projection interface `{ toGeo: (coord) => [lng, lat] }`

## Files Changed

- ✏️ `src/core/geomorpher.js` - Added projection parameter
- ✏️ `src/utils/projection.js` - Enhanced null handling
- ✏️ `src/index.js` - Export projection utilities
- ✏️ `README.md` - Added projection section
- ➕ `src/utils/projections.js` - New projection utilities
- ➕ `PROJECTIONS.md` - New documentation
- ➕ `examples/custom-projection.js` - New examples

## Next Steps (Optional)

Future enhancements could include:
1. Built-in proj4 integration (currently requires manual setup)
2. More pre-defined projections (Lambert, Albers, etc.)
3. Automatic coordinate system detection from GeoJSON metadata
4. Support for vertical coordinate systems
