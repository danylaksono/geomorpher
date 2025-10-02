import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { GeoMorpher } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadGeoJSON(relativePath) {
  const absolutePath = resolve(__dirname, "..", relativePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const [regularGeoJSON, cartogramGeoJSON] = await Promise.all([
    loadGeoJSON("data/oxford_lsoas_regular.json"),
    loadGeoJSON("data/oxford_lsoas_cartogram.json"),
  ]);

  const aggregations = {
    population: "sum",
    households: "sum",
  };

  const sampleData = regularGeoJSON.features.map((feature) => ({
    lsoa: feature.properties.code,
    population: Number(feature.properties.population ?? 0),
    households: Number(feature.properties.households ?? 0),
  }));

  const morpher = new GeoMorpher({
    regularGeoJSON,
    cartogramGeoJSON,
    data: sampleData,
    aggregations,
  });

  await morpher.prepare();

  const tween = morpher.getInterpolatedFeatureCollection(0.5);

  console.log("Regular feature count:", morpher.getRegularFeatureCollection().features.length);
  console.log("Cartogram feature count:", morpher.getCartogramFeatureCollection().features.length);
  console.log("Tween feature count:", tween.features.length);
  console.log("Sample tween feature properties:", tween.features[0].properties);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
