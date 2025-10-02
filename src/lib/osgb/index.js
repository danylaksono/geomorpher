// OSGB Projection by Jo Wood
// Original source https://observablehq.com/@jwolondon/projection

import { Ellipsoid } from "./ellipsoid.js";

export const OSGB = function () {
  const rad2Deg = 180 / Math.PI;
  const deg2Rad = Math.PI / 180;
  const airy1830 = new Ellipsoid("AIRY1830");
  const wgs84 = new Ellipsoid("WGS84");

  const scaleFactor = 0.9996012717;
  const latOrigin = 49;
  const lngOrigin = -2;
  const xOffset = 400000;
  const yOffset = -100000;

  // Public methods
  this.toOSGB = function (lngLat) {
    const lnglat2 = wgs84.projectDatum(lngLat, "AIRY1830");
    return geoToUTM(airy1830, lnglat2);
  };

  this.toGeo = function ([easting, northing]) {
    return airy1830.projectDatum(
      utmToGeo(airy1830, [easting, northing]),
      "WGS84"
    );
  };

  this.projection = function () {
    const osgbProj = () => {
      const degrees = 180 / Math.PI;
      return (λ, φ) => this.toOSGB([degrees * λ, degrees * φ]);
    };

    return d3.geoProjection(osgbProj());
  };

  // Private methods

  const geoToUTM = (ellipsoid, [lng, lat]) => {
    const a = ellipsoid.getEquatorialRadius();
    const b = ellipsoid.getPolarRadius();
    const e2 = ellipsoid.getSquaredEccentricity();
    const n = ellipsoid.getN();
    const n2 = n * n;
    const n3 = n2 * n;
    const lngTemp =
      lng -
      lngOrigin +
      180 -
      Math.floor((lng - lngOrigin + 180) / 360) * 360 -
      180;
    const phi = lat * deg2Rad;
    const phi0 = latOrigin * deg2Rad;
    const lambda = lngTemp * deg2Rad;
    const lambda2 = lambda * lambda;
    const lambda3 = lambda2 * lambda;
    const sinPhi = Math.sin(phi);
    const sin2Phi = sinPhi * sinPhi;
    const cosPhi = Math.cos(phi);
    const cos3Phi = cosPhi * cosPhi * cosPhi;
    const cos5Phi = cos3Phi * cosPhi * cosPhi;
    const tanPhi = Math.tan(phi);
    const tan2Phi = tanPhi * tanPhi;
    const tan4Phi = tan2Phi * tan2Phi;

    const v = (a * scaleFactor) / Math.sqrt(1 - e2 * sin2Phi);
    const rho = (a * scaleFactor * (1 - e2)) / Math.pow(1 - e2 * sin2Phi, 1.5);
    const neta2 = v / rho - 1;

    const M =
      b *
      scaleFactor *
      ((1 + n + 1.25 * n2 + 1.25 * n3) * (phi - phi0) -
        (3 * n + 3 * n2 + 2.625 * n3) *
          Math.sin(phi - phi0) *
          Math.cos(phi + phi0) +
        (1.875 * n2 + 1.875 * n3) *
          Math.sin(2 * (phi - phi0)) *
          Math.cos(2 * (phi + phi0)) -
        1.45833333333333333 *
          n3 *
          Math.sin(3 * (phi - phi0)) *
          Math.cos(3 * (phi + phi0)));

    const I = M + yOffset;
    const II = (v / 2) * sinPhi * cosPhi;
    const III = (v / 24) * sinPhi * cos3Phi * (5 - tan2Phi + 9 * neta2);
    const IIIA = (v / 720) * sinPhi * cos5Phi * (61 - 58 * tan2Phi + tan4Phi);
    const IV = v * cosPhi;
    const V = (v / 6) * cos3Phi * (v / rho - tan2Phi);
    const VI =
      (v / 120) *
      cos5Phi *
      (5 - 18 * tan2Phi + tan4Phi + 14 * neta2 - 58 * tan2Phi * neta2);

    return [
      xOffset + IV * lambda + V * lambda3 + VI * lambda2 * lambda3,
      I + II * lambda2 + III * lambda2 * lambda2 + IIIA * lambda3 * lambda3,
    ];
  };

  const utmToGeo = (ellipsoid, [easting, northing]) => {
    const a = ellipsoid.getEquatorialRadius();
    const b = ellipsoid.getPolarRadius();
    const e2 = ellipsoid.getSquaredEccentricity();
    const n = ellipsoid.getN();
    const n2 = n * n;
    const n3 = n2 * n;

    const phi0 = latOrigin * deg2Rad;
    let phi = (northing - yOffset) / (a * scaleFactor) + phi0;
    let M;

    M =
      b *
      scaleFactor *
      ((1 + n + 1.25 * n2 + 1.25 * n3) * (phi - phi0) -
        (3 * n + 3 * n2 + 2.625 * n3) *
          Math.sin(phi - phi0) *
          Math.cos(phi + phi0) +
        (1.875 * n2 + 1.875 * n3) *
          Math.sin(2 * (phi - phi0)) *
          Math.cos(2 * (phi + phi0)) -
        1.45833333333333333 *
          n3 *
          Math.sin(3 * (phi - phi0)) *
          Math.cos(3 * (phi + phi0)));

    while (Math.abs(northing - yOffset - M) >= 0.01) {
      phi = (northing - yOffset - M) / (a * scaleFactor) + phi;

      M =
        b *
        scaleFactor *
        ((1 + n + 1.25 * n2 + 1.25 * n3) * (phi - phi0) -
          (3 * n + 3 * n2 + 2.625 * n3) *
            Math.sin(phi - phi0) *
            Math.cos(phi + phi0) +
          (1.875 * n2 + 1.875 * n3) *
            Math.sin(2 * (phi - phi0)) *
            Math.cos(2 * (phi + phi0)) -
          1.45833333333333333 *
            n3 *
            Math.sin(3 * (phi - phi0)) *
            Math.cos(3 * (phi + phi0)));
    }

    const sinPhi = Math.sin(phi);
    const secPhi = 1 / Math.cos(phi);
    const sin2Phi = sinPhi * sinPhi;
    const tanPhi = Math.tan(phi);
    const tan2Phi = tanPhi * tanPhi;
    const tan4Phi = tan2Phi * tan2Phi;
    const tan6Phi = tan4Phi * tan2Phi;

    const v = (a * scaleFactor) / Math.sqrt(1 - e2 * sin2Phi);
    const v2 = v * v;
    const v3 = v2 * v;
    const v5 = v3 * v2;
    const v7 = v5 * v2;
    const rho = (a * scaleFactor * (1 - e2)) / Math.pow(1 - e2 * sin2Phi, 1.5);
    const neta2 = v / rho - 1;

    const VII = tanPhi / (2 * rho * v);
    const VIII =
      (tanPhi / (24 * rho * v3)) *
      (5 + 3 * tan2Phi + neta2 - 9 * tan2Phi * neta2);
    const IX = (tanPhi / (720 * rho * v5)) * (61 + 90 * tan2Phi + 45 * tan4Phi);
    const X = secPhi / v;
    const XI = (secPhi / (6 * v3)) * (v / rho + 2 * tan2Phi);
    const XII = (secPhi / (120 * v5)) * (5 + 28 * tan2Phi + 24 * tan4Phi);
    const XIIA =
      (secPhi / (5040 * v7)) *
      (61 + 662 * tan2Phi + 1320 * tan4Phi + 720 * tan6Phi);

    const E = easting - xOffset;
    const E2 = E * E;
    const E3 = E2 * E;
    const E4 = E3 * E;
    const E5 = E4 * E;
    const E6 = E5 * E;
    const E7 = E6 * E;

    return [
      lngOrigin + rad2Deg * (X * E - XI * E3 + XII * E5 - XIIA * E7),
      rad2Deg * (phi - VII * E2 + VIII * E4 - IX * E6),
    ];
  };
};
