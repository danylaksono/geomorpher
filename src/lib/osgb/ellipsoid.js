// OSGB Projection by Jo Wood
// Original source https://observablehq.com/@jwolondon/projection

export function Ellipsoid(eID = "WGS84") {
  const id = eID;
  const rad2Deg = 180 / Math.PI;
  const deg2Rad = Math.PI / 180;
  let a, b, e2, n;
  const store = (radius, ee2) => {
    a = radius;
    e2 = ee2;
    b = Math.sqrt(a * a * (1 - e2));
    n = (a - b) / (a + b);
  };

  switch (id) {
    case "AIRY1830":
      store(6377563.396, 0.0066705397616);
      break;
    case "WGS84":
      store(6378137, 0.00669438);
      break;
    default:
      console.error("Unknown id when creating new ellipsoid: ", id);
  }

  // Public methods
  this.getEquatorialRadius = function () {
    return a;
  };

  this.getPolarRadius = function () {
    return b;
  };

  this.getSquaredEccentricity = function () {
    return e2;
  };

  // Reports the amount of flattening as a ratio (a-b)/(a+b).
  this.getN = function () {
    return n;
  };

  this.projectDatum = function ([lng, lat], newDatum) {
    if (newDatum == id) {
      return [lng, lat]; // Ellipsoids identical so no need to reproject
    }

    switch (id) {
      case "AIRY1830":
        return molodensky(lng, lat, 573.604, 0.000011960023, 375, -111, 431);

      case "WGS84":
        return molodensky(lng, lat, -573.604, -0.000011960023, -375, 111, -431);

      default:
        console.error("Unknown ellipsoid when projecting datum ", id);
    }
  };

  // Private functions
  const molodensky = (lng, lat, dA, dF, dX, dY, dZ) => {
    const myA = a - dA;
    const myF = 0.0033528106647474805 - dF;
    const myES = 2 * myF - myF * myF;
    const myLat = lat * deg2Rad;
    const myLng = lng * deg2Rad;
    const sinLat = Math.sin(myLat);
    const sinLng = Math.sin(myLng);
    const cosLat = Math.cos(myLat);
    const cosLng = Math.cos(myLng);
    const rn = myA / Math.sqrt(1 - myES * sinLat * sinLat);
    const rm = (myA * (1 - myES)) / Math.pow(1 - myES * sinLat * sinLat, 1.5);
    const d1 = -dX * sinLat * cosLng - dY * sinLat * sinLng + dZ * cosLat;
    const d2 = (dA * (rn * myES * sinLat * cosLat)) / myA;
    const d3 = dF * (rm / (1 - myF) + rn * (1 - myF)) * sinLat * cosLat;
    const dLat = (d1 + d2 + d3) / rm;
    const dLng = (-dX * sinLng + dY * cosLng) / (rn * cosLat);
    return [(myLng + dLng) * rad2Deg, (myLat + dLat) * rad2Deg];
  };
}
