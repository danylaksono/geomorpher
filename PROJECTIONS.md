# Working with Custom Projections

This guide explains how to use `geo-morpher` with data in various coordinate systems.

## Quick Start

### Data Already in WGS84 (Latitude/Longitude)

Most web mapping data is already in WGS84 coordinates. Use the identity projection:

```javascript
import { GeoMorpher, WGS84Projection } from "geo-morpher";

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: WGS84Projection,  // No coordinate transformation
});
```

### Data in OSGB (British National Grid)

This is the **default**. No need to specify a projection:

```javascript
import { GeoMorpher } from "geo-morpher";

const morpher = new GeoMorpher({
  regularGeoJSON,    // OSGB coordinates
  cartogramGeoJSON,  // OSGB coordinates
  // projection: automatically uses OSGB
});
```

### Data in Other Projections

For other coordinate systems, create a custom projection object:

```javascript
const myProjection = {
  toGeo: ([x, y]) => {
    // Transform your coordinates to [longitude, latitude]
    const lng = ...; // your transformation
    const lat = ...; // your transformation
    return [lng, lat];
  }
};

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: myProjection,
});
```

## Detection Helper

Use `isLikelyWGS84()` to auto-detect coordinate systems:

```javascript
import { isLikelyWGS84 } from "geo-morpher";

const detected = isLikelyWGS84(myGeoJSON);
// Returns: 'WGS84', 'OSGB', or 'UNKNOWN'

if (detected === 'WGS84') {
  // Use WGS84Projection
} else if (detected === 'OSGB') {
  // Use default (no projection parameter)
}
```

## Common Projections

### Web Mercator (EPSG:3857)

Used by many tile services:

```javascript
import { WebMercatorProjection } from "geo-morpher";

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: WebMercatorProjection,
});
```

### UTM Zones

For UTM or other complex projections, use [proj4js](https://github.com/proj4js/proj4js):

```bash
npm install proj4
```

```javascript
import proj4 from 'proj4';

// Define UTM Zone 33N (EPSG:32633)
const utm33n = proj4.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs');

const UTM33Projection = {
  toGeo: ([easting, northing]) => {
    const [lng, lat] = proj4('EPSG:32633', 'EPSG:4326', [easting, northing]);
    return [lng, lat];
  }
};

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: UTM33Projection,
});
```

## Examples

### Example 1: US State Data (WGS84)

```javascript
import { GeoMorpher, WGS84Projection } from "geo-morpher";

const usStates = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { code: "CA", population: 39538223 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-124.4, 42.0],
          [-114.1, 32.5],
          // ... more coordinates
        ]]
      }
    }
  ]
};

const morpher = new GeoMorpher({
  regularGeoJSON: usStates,
  cartogramGeoJSON: usStatesCartogram,
  projection: WGS84Projection,
  geoJSONJoinColumn: "code",
});
```

### Example 2: European Data (Custom UTM)

```javascript
import proj4 from 'proj4';
import { GeoMorpher } from "geo-morpher";

const UTM32N = {
  toGeo: ([x, y]) => {
    const [lng, lat] = proj4(
      '+proj=utm +zone=32 +datum=WGS84',
      'WGS84',
      [x, y]
    );
    return [lng, lat];
  }
};

const morpher = new GeoMorpher({
  regularGeoJSON: europeanData,
  cartogramGeoJSON: europeanCartogram,
  projection: UTM32N,
});
```

## Troubleshooting

### Coordinates Look Wrong

Check your input coordinate system:

```javascript
import { isLikelyWGS84 } from "geo-morpher";

console.log("Regular:", isLikelyWGS84(regularGeoJSON));
console.log("Cartogram:", isLikelyWGS84(cartogramGeoJSON));
```

If detection fails, manually inspect coordinates:
- **WGS84**: longitude ≈ -180 to 180, latitude ≈ -90 to 90
- **OSGB**: easting ≈ 0 to 700000, northing ≈ 0 to 1300000
- **Web Mercator**: x ≈ -20037508 to 20037508, y ≈ -20048966 to 20048966
- **UTM**: easting ≈ 160000 to 840000, northing ≈ 0 to 10000000

### Map Appears in Wrong Location

Your input data and projection don't match. Common issues:
1. Using WGS84Projection with OSGB data → map in wrong place
2. Using default (OSGB) with WGS84 data → extreme distortion
3. Coordinates in wrong order (lat/lng vs lng/lat)

### Performance Issues

The projection transformation happens during `prepare()`. For large datasets:
- If data is already WGS84, use `WGS84Projection` to skip transformation
- For complex projections (proj4), consider pre-transforming data offline

## API Reference

### Projection Object Interface

```typescript
interface Projection {
  toGeo: (coord: [number, number]) => [number, number];
  name?: string; // Optional, for debugging
}
```

### Built-in Projections

| Export | Use Case | Coordinate System |
|--------|----------|-------------------|
| `WGS84Projection` | Data already in lat/lng | EPSG:4326 |
| `WebMercatorProjection` | Web map tiles | EPSG:3857 |
| *(default)* | UK/OSGB data | EPSG:27700 |

### Helper Functions

#### `isLikelyWGS84(geojson)`

Attempts to detect if coordinates are WGS84, OSGB, or unknown.

**Parameters:**
- `geojson` - GeoJSON FeatureCollection

**Returns:** `'WGS84' | 'OSGB' | 'UNKNOWN'`

#### `createProj4Projection(definition)` *(Node.js only)*

Creates a projection from a proj4 definition string.

**Parameters:**
- `definition` - Proj4 definition string

**Returns:** Projection object

**Example:**
```javascript
import { createProj4Projection } from "geo-morpher";

const projection = createProj4Projection(
  '+proj=utm +zone=33 +datum=WGS84'
);
```
