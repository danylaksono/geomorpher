import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const externalModules = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default {
  input: "src/index.js",
  output: [
    {
      file: "dist/index.js",
      format: "esm",
      sourcemap: true,
    },
    {
      file: "dist/index.cjs",
      format: "cjs",
      sourcemap: true,
      exports: "named",
    },
    {
      file: "dist/index.min.js",
      format: "esm",
      sourcemap: true,
      plugins: [terser()],
    },
    {
      file: "dist/index.min.cjs",
      format: "cjs",
      sourcemap: true,
      exports: "named",
      plugins: [terser()],
    },
  ],
  external: (id) => {
    if (externalModules.has(id)) return true;
    for (const externalId of externalModules) {
      if (id.startsWith(`${externalId}/`)) return true;
    }
    return false;
  },
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json(),
  ],
};
