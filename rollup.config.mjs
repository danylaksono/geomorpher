import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

/**
 * Bundler consumers resolve the ESM sources in `src/` directly via the package
 * `exports` map, so this build exists purely to produce standalone browser
 * bundles for CDN / <script> / Observable usage:
 *
 *   - `*.global.js`  IIFE, exposes `window.geoMorpher` for plain <script> tags.
 *   - `*.esm.js`     ESM, for <script type="module"> and Observable.
 *
 * These are deliberately not UMD: this package is `"type": "module"`, so Node
 * would parse a `.js` UMD bundle as ESM and its CommonJS branch would never
 * run, silently yielding an empty module.
 *
 * `maplibre-gl` and `leaflet` are never imported by the library (the map
 * namespace is injected by the caller), so nothing needs to be external here.
 */
const plugins = [nodeResolve({ browser: true }), commonjs(), json()];

const banner = "/* geo-morpher | MIT | https://github.com/danylaksono/geomorpher */";

export default {
  input: "src/index.js",
  output: [
    {
      file: "dist/geo-morpher.global.js",
      format: "iife",
      name: "geoMorpher",
      exports: "named",
      banner,
    },
    {
      file: "dist/geo-morpher.global.min.js",
      format: "iife",
      name: "geoMorpher",
      exports: "named",
      banner,
      plugins: [terser()],
    },
    {
      file: "dist/geo-morpher.esm.js",
      format: "esm",
      banner,
      plugins: [terser()],
    },
  ],
  plugins,
};
