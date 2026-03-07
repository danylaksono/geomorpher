import test from "node:test";
import assert from "node:assert/strict";
import { GeoMorpher, WGS84Projection } from "../src/index.js";
import { OSGB } from "../src/lib/osgb/index.js";

test("GeoMorpher auto-detects WGS84 projection", async () => {
  const wgs84GeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: "1" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-0.1278, 51.5074],
              [-0.1278, 51.5084],
              [-0.1268, 51.5084],
              [-0.1268, 51.5074],
              [-0.1278, 51.5074],
            ],
          ],
        },
      },
    ],
  };

  const morpher = new GeoMorpher({
    regularGeoJSON: wgs84GeoJSON,
    cartogramGeoJSON: wgs84GeoJSON,
    geoJSONJoinColumn: "id",
  });

  // Should have auto-detected WGS84Projection
  assert.equal(morpher.projection, WGS84Projection);

  await morpher.prepare();
  const regular = morpher.getRegularFeatureCollection();
  
  // Coordinates should remain the same (WGS84 is identity)
  assert.deepEqual(
    regular.features[0].geometry.coordinates[0][0],
    [-0.1278, 51.5074]
  );
});

test("GeoMorpher defaults to OSGB for non-WGS84 coordinates if not specified", async () => {
  const osgbGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: "1" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [451234, 201234],
              [452234, 201234],
              [452234, 202234],
              [451234, 202234],
              [451234, 201234],
            ],
          ],
        },
      },
    ],
  };

  const morpher = new GeoMorpher({
    regularGeoJSON: osgbGeoJSON,
    cartogramGeoJSON: osgbGeoJSON,
    geoJSONJoinColumn: "id",
  });

  // Should NOT be WGS84
  assert.notEqual(morpher.projection, WGS84Projection);
  // It will default to OSGB in toWGS84FeatureCollection if morpher.projection is null
  assert.equal(morpher.projection, null);

  await morpher.prepare();
  const regular = morpher.getRegularFeatureCollection();
  
  // Coordinates should be transformed to WGS84 (lat/lng)
  const [lng, lat] = regular.features[0].geometry.coordinates[0][0];
  assert.ok(lng > -10 && lng < 10); // Typical UK longitude range
  assert.ok(lat > 40 && lat < 65);  // Typical UK latitude range
});

test("GeoMorpher respects explicit projection even if auto-detection would differ", async () => {
    const wgs84GeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "1" },
          geometry: {
            type: "Polygon",
            coordinates: [[[-0.1278, 51.5074], [-0.1278, 51.5084], [-0.1268, 51.5084], [-0.1268, 51.5074], [-0.1278, 51.5074]]],
          },
        },
      ],
    };
  
    const customProjection = {
        toGeo: ([x, y]) => [x + 1, y + 1],
        name: 'Custom'
    };

    const morpher = new GeoMorpher({
      regularGeoJSON: wgs84GeoJSON,
      cartogramGeoJSON: wgs84GeoJSON,
      geoJSONJoinColumn: "id",
      projection: customProjection
    });
  
    assert.equal(morpher.projection, customProjection);
  
    await morpher.prepare();
    const regular = morpher.getRegularFeatureCollection();
    
    assert.deepEqual(
      regular.features[0].geometry.coordinates[0][0],
      [0.8722, 52.5074]
    );
  });
