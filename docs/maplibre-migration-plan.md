# MapLibre Migration Plan

_Last reviewed: 2025-10-09_

## Executive Summary
- Replace the existing Leaflet-specific adapter layer with a MapLibre GL JS integration that preserves geo-morpher morphing workflows while unlocking GPU-accelerated vector rendering, globe support, and style extensibility.
- Deliver the migration in three controlled phases: foundation (build and runtime setup), feature parity (core morphing, glyphs), and enhancement (MapLibre-native capabilities such as globe projection and shader-based effects).
- Maintain example parity during the transition by running Leaflet and MapLibre demos side by side until validation completes.

## Status Updates
- **2025-10-09:** Foundation tasks landed in Git (MapLibre dependency wiring, baseline morph layer implementation, and marker-based glyph adapter with documented CustomLayerInterface upgrade path).

## Current State Assessment
- `src/adapters/leaflet/*` exposes Leaflet helpers for layer creation, glyph rendering, and basemap styling.
- Morph logic (`src/core/geomorpher.js`, `src/utils/**`) is UI-agnostic; the adapter translates collections into Leaflet `L.geoJSON` layers and applies DOM-based effects for blur, opacity, and grayscale.
- Examples under `examples/` rely on Leaflet (and plain DOM manipulation) for controls, events, and tile basemaps.
- Tests (`test/geomorpher.test.js`) cover the computational core only; no adapter-level integration tests exist.

## Target Architecture
- Introduce `src/adapters/maplibre/` housing:
  - `createMapLibreMorphLayers` that builds GeoJSON sources and layer definitions (fill/line/symbol) driven by morph factor interpolation.
  - `createMapLibreGlyphLayer` leveraging MapLibre custom layers or dense Marker collections for glyph rendering.
  - Shared utilities for normalizing glyph sprites and managing WebGL state.
- Replace DOM-based basemap effects with MapLibre-native equivalents (e.g., layer opacity transitions, post-process-style adjustments via style expressions or custom layers).
- Use MapLibre GL JS (latest stable, currently 5.8.x) from npm, bundling with existing build tooling.
- Provide projection-aware rendering hooks to support both Mercator and globe modes via `map.setProjection`.[^1]

## Migration Phases

| Phase | Scope | Key Deliverables | Success Metrics |
| --- | --- | --- | --- |
| 1. Foundation | Build & runtime setup | npm dependency, MapLibre adapter scaffolding, updated examples/bootstrap | Map loads with static data; tests still pass |
| 2. Feature Parity | Morph layers, basemap effects, glyph overlay | Morph slider works; glyphs render via custom layers/markers; regression harness | Visual parity vs Leaflet demos |
| 3. Enhancements | MapLibre-native optimizations | Globe toggle, style-driven effects, performance tuning | Render time improvement, doc updates |

## Detailed Workstreams

### 1. Environment & Bundling
- Add `maplibre-gl` dependency and CSS import to `package.json` build pipeline.
- Ensure tree-shaking/build steps include WebGL polyfills only where needed.
- Update lint and type definitions for MapLibre-specific types.

### 2. Adapter Layer Implementation
- Create MapLibre adapter API mirroring Leaflet exports for drop-in usage.
- Implement source management: call `map.addSource` with morph collections (`regular`, `cartogram`, `interpolated`).
- Translate style callbacks into MapLibre layer `paint`/`layout` expressions; expose hooks for custom expressions.
- Replace `L.layerGroup` orchestration with MapLibre layer ordering (`beforeId`) control; maintain `updateMorphFactor` that updates the GeoJSON source data and triggers `map.triggerRepaint()`.[^2]

### 3. Glyph Rendering Strategy
- Evaluate two approaches:
  1. DOM markers using `new maplibregl.Marker({ element })` for simple overlays (mirrors current Leaflet markers).
  2. Custom WebGL layer implementing `CustomLayerInterface` for thousands of glyphs with better performance.[^2]
- Start with marker-based overlay for parity; document upgrade path to custom layer with batched canvas rendering for performance-critical cases.

### 4. Basemap & Visual Effects
- Recreate blur/opacity/grayscale transitions using MapLibre style expressions applied to background/raster layers.
- For effects unsupported via expressions, prototype a custom post-processing layer (offscreen framebuffer within `prerender`).

### 5. Controls & UI Integration
- Replace Leaflet controls with MapLibre equivalents or lightweight HTML overlays.
- Ensure morph slider and layer toggles interact with MapLibre sources/layers.

### 6. Testing & QA
- Add adapter-level Jest tests using @maplibre/maplibre-gl-js-mock or headless rendering harness.
- Build visual regression scripts (Playwright + pixel diff) to compare Leaflet vs MapLibre outputs during transition.
- Update CI to run new tests and bundle linting.

### 7. Documentation & Examples
- Create parallel MapLibre examples (`examples/maplibre/*`) replicating existing demos for comparison.
- Update README and migration guide with setup instructions, API usage, and limitations.
- Provide guidance for consumers choosing Leaflet vs MapLibre adapters during beta period.

## Evaluation & Risk Analysis
- **Feasibility**: High. Core morphing logic is renderer-agnostic; MapLibre exposes flexible GeoJSON & custom layer APIs.[^1][^2]
- **Complexity Hotspots**:
  - Glyph rendering performance when using markers; may require custom layer rewrite.
  - Basemap effects translation; MapLibre lacks DOM access, so shader/expression approach needed.
  - Testing infrastructure: absence of existing adapter tests necessitates new tooling.
- **Dependencies**: Requires WebGL2-capable environments; need graceful fallback or warning for unsupported browsers.
- **Mitigations**: Prototype critical pieces (glyph layer, basemap effects) early; keep Leaflet adapter intact until feature parity validated; introduce flags to switch adapters in examples.
- **Timeline Estimate**: 4–6 weeks part-time (1 engineer) including QA and documentation.

## Acceptance Criteria
- MapLibre adapter published with API parity (function names, parameters) and documented usage.
- Example gallery includes MapLibre demos matching Leaflet behaviour.
- Automated tests cover morph factor updates, GeoJSON source swapping, and glyph rendering smoke tests.
- README highlights MapLibre as the recommended path with caveats and migration steps for consumers.

## References
- MapLibre GL JS Documentation — Introduction & Map API.[^1]
- MapLibre GL JS Documentation — CustomLayerInterface for WebGL overlays.[^2]

[^1]: https://www.maplibre.org/maplibre-gl-js/docs/
[^2]: https://www.maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/
