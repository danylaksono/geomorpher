/**
 * Example: Using GeoMorpher with custom projections
 * 
 * This demonstrates how to use the library with data in different
 * coordinate systems (not just OSGB British National Grid)
 */

import { GeoMorpher, WGS84Projection, isLikelyWGS84 } from "../src/index.js";

// Example 1: Data already in WGS84 (lat/lng)
async function exampleWithWGS84Data() {
  console.log("\n=== Example 1: WGS84 Data (Identity Projection) ===");
  
  // Simulated GeoJSON data already in lat/lng coordinates
  const regularGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "US-CA", population: 39538223 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-124.4, 42.0],
            [-124.4, 32.5],
            [-114.1, 32.5],
            [-114.1, 42.0],
            [-124.4, 42.0]
          ]]
        }
      }
    ]
  };
  
  const cartogramGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "US-CA", population: 39538223 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-124.4, 42.0],
            [-124.4, 30.0],  // Distorted - larger area
            [-112.0, 30.0],
            [-112.0, 42.0],
            [-124.4, 42.0]
          ]]
        }
      }
    ]
  };
  
  // Detect coordinate system
  const detectedProjection = isLikelyWGS84(regularGeoJSON);
  console.log("Detected coordinate system:", detectedProjection);
  
  // Create morpher with WGS84 projection (no transformation)
  const morpher = new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    projection: WGS84Projection,  // Use identity projection
    geoJSONJoinColumn: "code",
  });
  
  await morpher.prepare();
  
  const regular = morpher.getRegularFeatureCollection();
  const tween = morpher.getInterpolatedFeatureCollection(0.5);
  
  console.log("Regular features:", regular.features.length);
  console.log("Tween features:", tween.features.length);
  console.log("Sample coordinate (regular):", regular.features[0].geometry.coordinates[0][0]);
  console.log("Sample coordinate (tween):", tween.features[0].geometry.coordinates[0][0]);
}

// Example 2: Using OSGB data (default behavior)
async function exampleWithOSGBData() {
  console.log("\n=== Example 2: OSGB Data (Default) ===");
  
  // Simulated OSGB data (British National Grid coordinates)
  const regularGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "E01028513", population: 2600 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [455646.9, 208058.9],
            [455694.3, 207577.4],
            [455812.8, 207406.5],
            [455623.2, 207437.6],
            [455646.9, 208058.9]
          ]]
        }
      }
    ]
  };
  
  const cartogramGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "E01028513", population: 2600 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [455646.9, 208258.9],  // Distorted
            [455694.3, 207377.4],
            [455912.8, 207206.5],
            [455523.2, 207637.6],
            [455646.9, 208258.9]
          ]]
        }
      }
    ]
  };
  
  const detectedProjection = isLikelyWGS84(regularGeoJSON);
  console.log("Detected coordinate system:", detectedProjection);
  
  // No projection parameter = uses OSGB by default
  const morpher = new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    geoJSONJoinColumn: "code",
  });
  
  await morpher.prepare();
  
  const regular = morpher.getRegularFeatureCollection();
  console.log("Regular features:", regular.features.length);
  console.log("Sample coordinate (converted to WGS84):", 
    regular.features[0].geometry.coordinates[0][0]);
}

// Example 3: Custom projection adapter
async function exampleWithCustomProjection() {
  console.log("\n=== Example 3: Custom Projection ===");
  
  // Create a custom projection for UTM Zone 33N (common in Europe)
  // This is a simple approximation - use proj4 for production
  const UTM33NProjection = {
    toGeo: ([easting, northing]) => {
      // Simplified UTM to lat/lng conversion (not accurate!)
      // In production, use proj4 or similar library
      const centralMeridian = 15;
      const falseEasting = 500000;
      const falseNorthing = 0;
      
      const x = (easting - falseEasting) / 1000000;
      const y = (northing - falseNorthing) / 1000000;
      
      const lng = centralMeridian + (x * 6);
      const lat = y * 90 / 10;
      
      return [lng, lat];
    },
    name: 'UTM Zone 33N (Approximation)'
  };
  
  const regularGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "AREA-1", population: 50000 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [500000, 6000000],
            [600000, 6000000],
            [600000, 6100000],
            [500000, 6100000],
            [500000, 6000000]
          ]]
        }
      }
    ]
  };
  
  const cartogramGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "AREA-1", population: 50000 },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [500000, 6000000],
            [650000, 6000000],  // Distorted
            [650000, 6150000],
            [500000, 6150000],
            [500000, 6000000]
          ]]
        }
      }
    ]
  };
  
  const morpher = new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    projection: UTM33NProjection,
    geoJSONJoinColumn: "code",
  });
  
  await morpher.prepare();
  
  const regular = morpher.getRegularFeatureCollection();
  console.log("Regular features:", regular.features.length);
  console.log("Sample coordinate (converted):", 
    regular.features[0].geometry.coordinates[0][0]);
}

// Run all examples
async function main() {
  console.log("GeoMorpher Custom Projection Examples");
  console.log("=====================================");
  
  await exampleWithWGS84Data();
  await exampleWithOSGBData();
  await exampleWithCustomProjection();
  
  console.log("\n✅ All examples completed!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
