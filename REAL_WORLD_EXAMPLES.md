# Real-World Usage Examples

## Example: Using Natural Earth Data (WGS84)

Natural Earth provides country/state boundaries in WGS84.

```javascript
import { GeoMorpher, WGS84Projection } from "geo-morpher";
import { readFile } from "fs/promises";

// Load Natural Earth countries (WGS84)
const countries = JSON.parse(
  await readFile("ne_110m_admin_0_countries.json", "utf8")
);

// Create a simple population-based cartogram
// (You'd use a proper cartogram algorithm in practice)
const cartogram = generateCartogram(countries, "POP_EST");

const morpher = new GeoMorpher({
  regularGeoJSON: countries,
  cartogramGeoJSON: cartogram,
  projection: WGS84Projection,  // Data is already in lat/lng
  geoJSONJoinColumn: "ISO_A3",  // Match by ISO code
  data: countries.features.map(f => ({
    code: f.properties.ISO_A3,
    population: f.properties.POP_EST,
    gdp: f.properties.GDP_MD
  })),
  aggregations: {
    population: "sum",
    gdp: "sum"
  }
});

await morpher.prepare();

// Use in Leaflet
const { group, updateMorphFactor } = await createLeafletMorphLayers({
  morpher,
  L,
  morphFactor: 0,
  regularStyle: () => ({ color: "#3388ff", weight: 1 }),
  cartogramStyle: () => ({ color: "#ff7800", weight: 1 }),
  tweenStyle: () => ({ color: "#2ca02c", weight: 2 })
});

// Animate the morph
let factor = 0;
setInterval(() => {
  factor = (factor + 0.01) % 1;
  updateMorphFactor(factor);
}, 50);
```

## Example: US Census Data (Albers Equal Area)

US Census data often uses Albers Equal Area projection.

```javascript
import proj4 from "proj4";
import { GeoMorpher } from "geo-morpher";

// Define US Albers Equal Area projection
proj4.defs("EPSG:5070", "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs");

const AlbersProjection = {
  toGeo: ([x, y]) => {
    const [lng, lat] = proj4("EPSG:5070", "EPSG:4326", [x, y]);
    return [lng, lat];
  },
  name: "Albers Equal Area (EPSG:5070)"
};

const morpher = new GeoMorpher({
  regularGeoJSON: usStates,      // In Albers projection
  cartogramGeoJSON: usCartogram, // Also in Albers
  projection: AlbersProjection,
  geoJSONJoinColumn: "GEOID"
});
```

## Example: OpenStreetMap Data (Web Mercator)

OSM exports are often in Web Mercator (EPSG:3857).

```javascript
import { GeoMorpher, WebMercatorProjection } from "geo-morpher";

// Load OSM export (Web Mercator coordinates)
const osmData = await loadOSMExport("city_boundaries.geojson");
const cartogram = await generateCartogram(osmData);

const morpher = new GeoMorpher({
  regularGeoJSON: osmData,
  cartogramGeoJSON: cartogram,
  projection: WebMercatorProjection,
  geoJSONJoinColumn: "id"
});
```

## Example: Auto-Detection with Fallback

```javascript
import { GeoMorpher, WGS84Projection, isLikelyWGS84 } from "geo-morpher";

async function createMorpher(regularGeoJSON, cartogramGeoJSON) {
  // Auto-detect projection
  const detected = isLikelyWGS84(regularGeoJSON);
  
  let projection;
  if (detected === "WGS84") {
    console.log("✓ Detected WGS84 - using identity projection");
    projection = WGS84Projection;
  } else if (detected === "OSGB") {
    console.log("✓ Detected OSGB - using default projection");
    projection = null; // Use default OSGB
  } else {
    console.warn("⚠ Unknown projection - assuming WGS84");
    projection = WGS84Projection;
  }
  
  return new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    projection,
    geoJSONJoinColumn: "id"
  });
}

// Usage
const morpher = await createMorpher(myData, myCartogram);
await morpher.prepare();
```

## Example: Multiple Data Sources

```javascript
import { GeoMorpher, WGS84Projection } from "geo-morpher";

// Scenario: Regular geometry from one source, data from another
const regularGeoJSON = await fetch("boundaries.geojson").then(r => r.json());
const externalData = await fetch("statistics.json").then(r => r.json());

// Generate cartogram (using external library)
const { cartogram } = await generateDorseyCartogram({
  features: regularGeoJSON.features,
  values: externalData.map(d => d.population)
});

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON: cartogram,
  projection: WGS84Projection,
  data: externalData,
  joinColumn: "area_id",
  geoJSONJoinColumn: "id",
  aggregations: {
    population: "sum",
    income: "mean"
  }
});

await morpher.prepare();
```

## Example: Working with TopoJSON

```javascript
import * as topojson from "topojson-client";
import { GeoMorpher, WGS84Projection } from "geo-morpher";

// Load TopoJSON (often in WGS84)
const topoData = await fetch("world.topojson").then(r => r.json());

// Convert to GeoJSON
const regularGeoJSON = topojson.feature(
  topoData, 
  topoData.objects.countries
);

// Generate cartogram...
const cartogramGeoJSON = await createCartogram(regularGeoJSON);

const morpher = new GeoMorpher({
  regularGeoJSON,
  cartogramGeoJSON,
  projection: WGS84Projection,
  geoJSONJoinColumn: "iso_a3"
});
```

## Tips for Success

### 1. Verify Your Coordinate System

Before using the library, check your data:

```javascript
// Look at first coordinate
const coords = myGeoJSON.features[0].geometry.coordinates[0][0];
console.log("Sample coordinate:", coords);

// WGS84: [-180 to 180, -90 to 90]
// OSGB: [0 to 700000, 0 to 1300000]
// Web Mercator: [-20037508 to 20037508, -20048966 to 20048966]
```

### 2. Ensure Matching Projections

Both regular and cartogram GeoJSON must be in the **same projection**:

```javascript
// ✓ CORRECT
const morpher = new GeoMorpher({
  regularGeoJSON: dataInUTM,     // UTM Zone 33N
  cartogramGeoJSON: cartogramInUTM, // Also UTM Zone 33N
  projection: UTM33Projection
});

// ✗ WRONG - mismatched projections
const morpher = new GeoMorpher({
  regularGeoJSON: dataInWGS84,      // WGS84
  cartogramGeoJSON: cartogramInOSGB, // OSGB - won't morph correctly!
  projection: WGS84Projection
});
```

### 3. Pre-transform for Performance

For very large datasets or complex projections, consider pre-transforming:

```bash
# Using ogr2ogr to convert OSGB to WGS84
ogr2ogr -f GeoJSON \
  -t_srs EPSG:4326 \
  output_wgs84.json \
  input_osgb.json
```

Then use `WGS84Projection` for better performance.

### 4. Test with Small Dataset First

```javascript
// Test with first 10 features
const testGeoJSON = {
  type: "FeatureCollection",
  features: regularGeoJSON.features.slice(0, 10)
};

const morpher = new GeoMorpher({
  regularGeoJSON: testGeoJSON,
  cartogramGeoJSON: cartogramGeoJSON,
  projection: WGS84Projection
});

await morpher.prepare();
// Verify output looks correct before processing full dataset
```
