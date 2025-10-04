import cloneDeep from "lodash/cloneDeep.js";
import * as turf from "@turf/turf";
import { OSGB } from "../lib/osgb/index.js";

const DEFAULT_PROJECTION = new OSGB();

export function transformCoordinates(coords, projection = DEFAULT_PROJECTION) {
  if (Array.isArray(coords[0])) {
    return coords.map((child) => transformCoordinates(child, projection));
  }

  if (coords.length === 4 && typeof coords[0] === "number") {
    const [minX, minY, maxX, maxY] = coords;
    const [tMinX, tMinY] = projection.toGeo([minX, minY]);
    const [tMaxX, tMaxY] = projection.toGeo([maxX, maxY]);
    return [tMinX, tMinY, tMaxX, tMaxY];
  }

  const [lng, lat] = projection.toGeo(coords);
  return [lng, lat];
}

export function transformGeometry(geometry, projection = DEFAULT_PROJECTION) {
  if (!geometry) return geometry;

  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map((geom) =>
        transformGeometry(geom, projection)
      ),
    };
  }

  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates, projection),
  };
}

export function toWGS84FeatureCollection(fc, projection = DEFAULT_PROJECTION) {
  if (!fc) return fc;
  
  // Use default projection if null/undefined
  const proj = projection || DEFAULT_PROJECTION;

  const cloned = cloneDeep(fc);
  turf.coordEach(cloned, (coord) => {
    const [lng, lat] = proj.toGeo(coord);
    coord[0] = lng;
    coord[1] = lat;
  });

  if (cloned.type === "FeatureCollection") {
    return cloned;
  }

  if (cloned.type === "Feature") {
    return turf.featureCollection([cloned]);
  }

  return turf.featureCollection([
    { type: "Feature", geometry: cloned, properties: {} },
  ]);
}
