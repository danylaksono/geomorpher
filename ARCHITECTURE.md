# Geo-Morpher Architecture Diagram

## Package Import Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         PACKAGE ENTRY                           │
│                                                                 │
│  npm install geo-morpher                                        │
│                                                                 │
│  import { ... } from 'geo-morpher'                             │
│                    │                                            │
│                    ▼                                            │
│             morphs.js (main)                                    │
│                    │                                            │
│                    ▼                                            │
│              src/index.js                                       │
│                    │                                            │
└────────────────────┼───────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐       ┌──────────────────┐
│ Core Engine   │       │ Leaflet Adapter  │
│               │       │                  │
│ GeoMorpher    │       │ createLeaflet... │
│ geoMorpher    │       │                  │
└───────────────┘       └──────────────────┘
```

## Leaflet Adapter Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    LEAFLET ADAPTER MODULES                       │
└──────────────────────────────────────────────────────────────────┘

Import Options:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣  from 'geo-morpher/leaflet'
    │
    └─► src/adapters/leaflet/index.js (BARREL EXPORT)
        │
        ├─► morphLayers.js
        ├─► glyphLayer.js
        └─► utils/
            ├─► coordinates.js
            ├─► glyphNormalizer.js
            └─► collections.js

2️⃣  from 'geo-morpher/leaflet/morph'
    │
    └─► src/adapters/leaflet/morphLayers.js (DIRECT)

3️⃣  from 'geo-morpher/leaflet/glyph'
    │
    └─► src/adapters/leaflet/glyphLayer.js (DIRECT)

4️⃣  from 'geo-morpher/adapters/leaflet' (LEGACY)
    │
    └─► src/adapters/leaflet.js (FACADE)
        │
        └─► Re-exports from leaflet/index.js


Module Responsibilities:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────┐
│ morphLayers.js (231 lines)                                      │
├─────────────────────────────────────────────────────────────────┤
│ • createLeafletMorphLayers()                                    │
│ • Polygon morphing (regular ↔ cartogram)                       │
│ • Basemap effects (blur, opacity, grayscale, brightness)       │
│ • Layer group management                                        │
│ • Dynamic morph factor updates                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ glyphLayer.js (224 lines)                                       │
├─────────────────────────────────────────────────────────────────┤
│ • createLeafletGlyphLayer()                                     │
│ • Custom marker/glyph rendering                                 │
│ • Position synchronization with morphing                        │
│ • Data resolution and filtering                                 │
│ • Marker lifecycle (create/update/remove)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ utils/coordinates.js (64 lines)                                 │
├─────────────────────────────────────────────────────────────────┤
│ • toLatLng() - Extract [lat, lng] from features                │
│ • isHTMLElement() - DOM type checking                           │
│ • Centroid calculation fallback                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ utils/glyphNormalizer.js (94 lines)                             │
├─────────────────────────────────────────────────────────────────┤
│ • normalizeGlyphResult() - Normalize glyph formats             │
│ • DEFAULT_GLYPH_CLASS, DEFAULT_ICON_SIZE, etc.                 │
│ • Handle HTML strings, elements, pre-built icons               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ utils/collections.js (41 lines)                                 │
├─────────────────────────────────────────────────────────────────┤
│ • resolveCollection() - Resolve feature collections            │
│ • collectionRetrievers - Getter lookup table                   │
│ • DEFAULT_GEOMETRY constant                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Dependency Graph

```
morphLayers.js
    │
    └─► (self-contained, no internal dependencies)


glyphLayer.js
    │
    ├─► utils/coordinates.js
    │       └─► toLatLng()
    │
    ├─► utils/glyphNormalizer.js
    │       └─► normalizeGlyphResult()
    │       └─► DEFAULT_* constants
    │
    └─► utils/collections.js
            └─► resolveCollection()
            └─► DEFAULT_GEOMETRY
```

## Data Flow Example: Glyph Rendering

```
User Code
    │
    │ createLeafletGlyphLayer({ drawGlyph, ... })
    │
    ▼
glyphLayer.js
    │
    ├─► resolveCollection()  ──► Get features from morpher
    │   (utils/collections.js)
    │
    ├─► drawGlyph()  ──────────► User's rendering function
    │   returns glyph config
    │
    ├─► normalizeGlyphResult()  ► Convert to Leaflet icon
    │   (utils/glyphNormalizer.js)
    │
    ├─► toLatLng()  ────────────► Extract [lat, lng]
    │   (utils/coordinates.js)
    │
    └─► L.marker()  ────────────► Create Leaflet marker
        │
        └─► Add to layer group
```

## Benefits of This Architecture

✅ **Separation of Concerns**
   - Morph layers and glyphs are independent
   - Utilities are reusable across modules

✅ **Tree-Shaking**
   - Import only what you need
   - Smaller production bundles

✅ **Maintainability**
   - Smaller, focused files
   - Clear module boundaries
   - Easy to locate bugs

✅ **Extensibility**
   - Add new adapters without touching existing code
   - Easy to add new features

✅ **Backward Compatible**
   - All existing imports work
   - No breaking changes
   - Gradual migration path

✅ **Testing**
   - Test utilities in isolation
   - Mock dependencies easily
   - Focused unit tests
