# Leaflet Adapter Refactoring - Architecture

## Overview

The Leaflet adapter has been refactored to follow the **separation of concerns** principle, splitting the monolithic `leaflet.js` file into modular, focused components.

## New Structure

```
src/adapters/
  leaflet/
    index.js              # Barrel export (main entry point)
    morphLayers.js        # Polygon morph layers with basemap effects
    glyphLayer.js         # Glyph/marker rendering system
    utils/
      coordinates.js      # Coordinate extraction utilities
      glyphNormalizer.js  # Glyph option normalization
      collections.js      # Collection resolution utilities
  leaflet.js              # Deprecated facade for backward compatibility
```

## Module Responsibilities

### 1. **morphLayers.js** (~230 lines)
- **Main export:** `createLeafletMorphLayers()`
- **Purpose:** Handles polygon morphing between regular and cartogram geometries
- **Features:**
  - Creates regular, cartogram, and tween (interpolated) layers
  - Basemap effect system (blur, opacity, grayscale, brightness)
  - Dynamic morph factor updates
  - Layer group management

### 2. **glyphLayer.js** (~240 lines)
- **Main export:** `createLeafletGlyphLayer()`
- **Purpose:** Renders custom markers/glyphs that follow morphing geometry
- **Features:**
  - Custom glyph rendering via `drawGlyph` callback
  - Marker position synchronization with morphing
  - Data resolution and feature filtering
  - Marker lifecycle management (create/update/remove)

### 3. **utils/coordinates.js** (~60 lines)
- **Exports:** `toLatLng()`, `isHTMLElement()`
- **Purpose:** Coordinate extraction and DOM utilities
- **Features:**
  - Extract [lat, lng] from GeoJSON features
  - Centroid calculation fallback
  - HTMLElement type checking

### 4. **utils/glyphNormalizer.js** (~95 lines)
- **Exports:** `normalizeGlyphResult()`, glyph constants
- **Purpose:** Normalize various glyph result formats
- **Features:**
  - Convert HTML strings/elements to Leaflet icons
  - Handle pre-built icons
  - Apply default styles and dimensions
  - Constants: `DEFAULT_GLYPH_CLASS`, `DEFAULT_ICON_SIZE`, `DEFAULT_ICON_ANCHOR`

### 5. **utils/collections.js** (~40 lines)
- **Exports:** `resolveCollection()`, `collectionRetrievers`, `DEFAULT_GEOMETRY`
- **Purpose:** Feature collection resolution
- **Features:**
  - Resolve collections by geometry type (regular/cartogram/interpolated)
  - Support custom geometry functions
  - Collection getter lookup table

### 6. **index.js** (Barrel Export)
- **Purpose:** Main entry point for the leaflet adapter
- **Exports:** All public APIs from modules above
- **Usage:** Simplifies imports for consumers

### 7. **leaflet.js** (Deprecated Facade)
- **Purpose:** Backward compatibility
- **Status:** Deprecated, maintained for existing code
- **Usage:** Re-exports from new modules

## Import Patterns

### New Modular Imports (Recommended)

```javascript
// Import everything from the main barrel export
import { createLeafletMorphLayers, createLeafletGlyphLayer } from 'geo-morpher/leaflet';

// Import specific modules
import { createLeafletMorphLayers } from 'geo-morpher/leaflet/morph';
import { createLeafletGlyphLayer } from 'geo-morpher/leaflet/glyph';
```

### Legacy Imports (Still Supported)

```javascript
// Old import path still works via facade
import { createLeafletMorphLayers, createLeafletGlyphLayer } from 'geo-morpher/adapters/leaflet';
```

### From Main Package Entry

```javascript
// Also works through main index.js
import { createLeafletMorphLayers, createLeafletGlyphLayer } from 'geo-morpher';
```

## Package.json Exports

```json
{
  "exports": {
    ".": "./morphs.js",
    "./leaflet": "./src/adapters/leaflet/index.js",          // Main barrel export
    "./leaflet/morph": "./src/adapters/leaflet/morphLayers.js",  // Morph-only
    "./leaflet/glyph": "./src/adapters/leaflet/glyphLayer.js",   // Glyph-only
    "./adapters/leaflet": "./src/adapters/leaflet.js",       // Legacy facade
    "./core/geomorpher": "./src/core/geomorpher.js"
  }
}
```

## Benefits

### 1. **Clear Separation of Concerns**
- Polygon morphing and glyph rendering are completely independent
- Utilities are organized by purpose
- Each module has a single, clear responsibility

### 2. **Improved Maintainability**
- Easier to locate and fix bugs
- Smaller files are easier to understand
- Clear module boundaries reduce coupling

### 3. **Better Testability**
- Test utilities in isolation
- Mock dependencies more easily
- Focused unit tests per module

### 4. **Enhanced Extensibility**
- Add new adapters (D3, Mapbox) without touching existing code
- Add new glyph types as separate modules
- Easy to add features like animated transitions

### 5. **Tree-Shaking Support**
- Bundlers can eliminate unused code
- Users only pay for what they use
- Smaller production bundles

### 6. **100% Backward Compatible**
- Existing code continues to work
- Gradual migration path
- No breaking changes

## Migration Guide

No migration required! All existing imports continue to work. However, for new code:

**Before:**
```javascript
import { createLeafletMorphLayers } from 'geo-morpher/adapters/leaflet';
```

**After (Optional, Recommended):**
```javascript
import { createLeafletMorphLayers } from 'geo-morpher/leaflet';
// or
import { createLeafletMorphLayers } from 'geo-morpher/leaflet/morph';
```

## Testing

All existing tests pass without modification:
- ✅ GeoMorpher prepares enriched collections
- ✅ geoMorpher legacy wrapper returns structured result
- ✅ Leaflet helper produces layer group
- ✅ Glyph layer renders markers and updates with morph factor

## Future Considerations

### Potential Enhancements
1. **Additional Adapters:** D3.js, Mapbox GL, deck.gl
2. **Glyph Types:** Canvas-based glyphs, WebGL glyphs, cluster glyphs
3. **Transitions:** Animated morphing with easing functions
4. **Performance:** Web Workers for heavy computations
5. **Type Safety:** JSDoc comments for better IDE support

### Code Statistics
- **Before:** 1 file, ~550 lines
- **After:** 7 files (6 modules + 1 facade)
  - morphLayers.js: ~230 lines
  - glyphLayer.js: ~240 lines
  - utils/coordinates.js: ~60 lines
  - utils/glyphNormalizer.js: ~95 lines
  - utils/collections.js: ~40 lines
  - index.js: ~15 lines
  - leaflet.js (facade): ~10 lines

**Total: ~690 lines** (including documentation comments)
**Code increase:** ~25% (due to JSDoc and module exports)
**Maintainability increase:** Significant

## Conclusion

The refactoring successfully separates concerns while maintaining 100% backward compatibility. The new architecture provides a solid foundation for future enhancements and makes the codebase significantly more maintainable.
