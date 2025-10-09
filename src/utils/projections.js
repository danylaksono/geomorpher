/**
 * Common projection utilities for GeoMorpher
 * 
 * Use these when your input data is not in OSGB British National Grid
 */

/**
 * Identity projection for data already in WGS84 (lat/lng)
 * Use this when your GeoJSON is already in geographic coordinates
 */
export const WGS84Projection = {
  toGeo: ([x, y]) => [x, y],
  name: 'WGS84 (Identity)'
};

/**
 * Web Mercator projection (EPSG:3857)
 * Common for web maps and some tile services
 */
export const WebMercatorProjection = {
  toGeo: ([x, y]) => {
    const lng = (x * 180) / 20037508.34;
    const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
    return [lng, lat];
  },
  name: 'Web Mercator (EPSG:3857)'
};

/**
 * Create a custom projection from proj4 definition
 * Requires proj4 to be installed separately
 * 
 * @example
 * import proj4 from 'proj4';
 * const projection = createProj4Projection(
 *   '+proj=utm +zone=33 +datum=WGS84'
 * );
 */
export function createProj4Projection(projDefinition) {
  if (typeof require !== 'undefined') {
    try {
      const proj4 = require('proj4');
      const transform = proj4(projDefinition, 'WGS84');
      return {
        toGeo: ([x, y]) => {
          const [lng, lat] = transform.forward([x, y]);
          return [lng, lat];
        },
        name: `proj4: ${projDefinition}`
      };
    } catch (err) {
      throw new Error('proj4 is required for custom projections. Install it with: npm install proj4');
    }
  }
  throw new Error('createProj4Projection is only available in Node.js environments');
}

/**
 * Helper to detect if coordinates are likely already in WGS84
 * Returns true if coordinates appear to be lat/lng
 */
export function isLikelyWGS84(geojson) {
  if (!geojson?.features?.[0]?.geometry?.coordinates) {
    return null;
  }
  
  const coords = geojson.features[0].geometry.coordinates;
  
  // Flatten to get first coordinate pair
  let point = coords;
  while (Array.isArray(point[0])) {
    point = point[0];
  }
  
  const [x, y] = point;
  
  // WGS84 has lng in [-180, 180] and lat in [-90, 90]
  const inWGS84Range = x >= -180 && x <= 180 && y >= -90 && y <= 90;
  
  // OSGB has much larger numbers (eastings ~0-700000, northings ~0-1300000)
  const inOSGBRange = x >= 0 && x <= 800000 && y >= 0 && y <= 1400000;
  
  if (inWGS84Range && !inOSGBRange) {
    return 'WGS84';
  } else if (inOSGBRange && !inWGS84Range) {
    return 'OSGB';
  } else {
    return 'UNKNOWN';
  }
}
