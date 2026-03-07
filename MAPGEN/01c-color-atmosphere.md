# Module 1C: Color & Atmosphere Engine

**Phase**: 1 (parallel — no dependencies on other Phase 1 modules)
**Depends on**: Phase 0 (`TileKind`, `CellColor`)
**Creates**: `src/game/mapgen/color.ts`, `src/game/mapgen/color_test.ts`
**Depended on by**: Module 3L (Color Rendering)

---

## Overview

Generate per-cell color variance at map creation time. Each tile gets a subtle
color offset from its base color, creating organic-looking terrain instead of
flat uniform fields. Optional Perlin noise layer adds large-scale color veins
(e.g., mineral deposits, temperature gradients near vents).

---

## Types

```typescript
import type { CellColor } from "../tiles.ts"

/** Color profile defining base color and allowed variance per tile type */
export interface TileColorProfile {
  readonly baseR: number    // 0–255
  readonly baseG: number
  readonly baseB: number
  readonly varianceR: number  // max +/- offset
  readonly varianceG: number
  readonly varianceB: number
}

/** Biome-level color modulation (applied on top of tile colors) */
export interface BiomeColorShift {
  readonly tempR: number    // additive shift to R channel
  readonly tempG: number
  readonly tempB: number
}

/** Full color generation configuration */
export interface ColorGenConfig {
  readonly tileProfiles: Record<string, TileColorProfile>  // keyed by TileKind
  readonly perlinScale: number      // Perlin noise frequency (0.02–0.1 typical)
  readonly perlinInfluence: number  // 0.0–1.0, how much Perlin modulates variance
}
```

---

## Default Color Profiles

```typescript
export const DEFAULT_TILE_COLOR_PROFILES: Record<string, TileColorProfile> = {
  water:    { baseR: 0x08, baseG: 0xAF, baseB: 0xFF, varianceR: 5,  varianceG: 12, varianceB: 8  },
  wall:     { baseR: 0x28, baseG: 0x42, baseB: 0x48, varianceR: 10, varianceG: 8,  varianceB: 6  },
  bedrock:  { baseR: 0x1A, baseG: 0x1A, baseB: 0x22, varianceR: 4,  varianceG: 4,  varianceB: 6  },
  sand:     { baseR: 0xC8, baseG: 0xB0, baseB: 0x78, varianceR: 12, varianceG: 10, varianceB: 8  },
  kelp:     { baseR: 0x22, baseG: 0x88, baseB: 0x44, varianceR: 8,  varianceG: 15, varianceB: 6  },
  coral:    { baseR: 0xCC, baseG: 0x55, baseB: 0x66, varianceR: 20, varianceG: 15, varianceB: 10 },
  vent:     { baseR: 0xFF, baseG: 0x66, baseB: 0x22, varianceR: 15, varianceG: 20, varianceB: 5  },
  current:  { baseR: 0x44, baseG: 0xBB, baseB: 0xEE, varianceR: 6,  varianceG: 8,  varianceB: 10 },
  shallows: { baseR: 0x66, baseG: 0xCC, baseB: 0xBB, varianceR: 8,  varianceG: 10, varianceB: 8  },
  abyss:    { baseR: 0x02, baseG: 0x04, baseB: 0x08, varianceR: 2,  varianceG: 2,  varianceB: 4  },
}
```

---

## Core Algorithm

```typescript
/**
 * Generate per-cell color offsets for the entire map.
 * Returns a parallel array of CellColor (same size as tiles[]).
 */
export function generateCellColors(
  tiles: TileKind[],
  width: number,
  height: number,
  config: ColorGenConfig,
  random: () => number,
): CellColor[]

Algorithm:
  1. Optionally initialize Perlin noise grid:
     - If config.perlinInfluence > 0:
       Generate 2D Perlin noise values for each (x, y)
       using config.perlinScale as frequency

  2. For each cell (x, y) in tiles:
     a. Look up TileColorProfile for tiles[index]
     b. Generate base offset:
        dr = (random() * 2 - 1) * profile.varianceR
        dg = (random() * 2 - 1) * profile.varianceG
        db = (random() * 2 - 1) * profile.varianceB
     c. If Perlin noise is enabled:
        perlinValue = perlinNoise(x * config.perlinScale, y * config.perlinScale)
        // perlinValue is -1 to 1
        dr = lerp(dr, dr * perlinValue, config.perlinInfluence)
        dg = lerp(dg, dg * perlinValue, config.perlinInfluence)
        db = lerp(db, db * perlinValue, config.perlinInfluence)
     d. Normalize to -1.0..1.0 range:
        cellColors[index] = {
          r: clamp(dr / 255, -1, 1),
          g: clamp(dg / 255, -1, 1),
          b: clamp(db / 255, -1, 1),
        }

  3. Return cellColors
```

### Perlin Noise (simplified 2D)

```typescript
/**
 * Simple 2D Perlin noise. Can use a permutation table seeded from random().
 * Returns value in range [-1, 1].
 */
function perlin2D(x: number, y: number, permTable: number[]): number

  Standard implementation:
  1. Determine grid cell (xi, yi) = floor(x), floor(y)
  2. Compute fractional position (xf, yf) within cell
  3. Fade curves: u = fade(xf), v = fade(yf) where fade(t) = t*t*t*(t*(t*6-15)+10)
  4. Hash corners using permTable
  5. Compute gradient dot products at 4 corners
  6. Bilinear interpolation using u, v
```

Alternatively, use value noise (simpler) if Perlin is too complex:

```typescript
function valueNoise2D(x: number, y: number, random: () => number): number
  // Hash-based value noise — acceptable for color variance
```

---

## Biome Color Application

```typescript
/**
 * Apply a biome-level color shift to a region of the cellColors array.
 * Called after initial generation, once per biome zone.
 */
export function applyBiomeColorShift(
  cellColors: CellColor[],
  width: number,
  regionMask: boolean[],     // which cells belong to this biome zone
  shift: BiomeColorShift,
): void

  For each cell where regionMask[index] is true:
    cellColors[index] = {
      r: clamp(cellColors[index].r + shift.tempR / 255, -1, 1),
      g: clamp(cellColors[index].g + shift.tempG / 255, -1, 1),
      b: clamp(cellColors[index].b + shift.tempB / 255, -1, 1),
    }
```

---

## Utility: Color Resolution at Render Time

```typescript
/**
 * Resolve a cell's final display color by combining:
 * - Tile base color (from profile)
 * - Cell color offset (from generation)
 * - Light level (from lightMap)
 * - Visibility level
 *
 * Returns CSS hex string "#rrggbb"
 */
export function resolveCellColor(
  tile: TileKind,
  cellColor: CellColor,
  lightLevel: number,          // 0.0–1.0
  visibility: 0 | 1 | 2 | 3,
  profiles?: Record<string, TileColorProfile>,
): string

Algorithm:
  1. profile = (profiles ?? DEFAULT_TILE_COLOR_PROFILES)[tile]
  2. r = profile.baseR + cellColor.r * profile.varianceR
     g = profile.baseG + cellColor.g * profile.varianceG
     b = profile.baseB + cellColor.b * profile.varianceB
  3. Apply light: r *= lightLevel, g *= lightLevel, b *= lightLevel
  4. Apply visibility dimming:
     if visibility <= 1: multiply by 0.5 (sonar memory)
     if visibility === 0: multiply by 0.3 (deep memory)
  5. Clamp to [0, 255], return as hex
```

---

## Integration Contract

```typescript
// Used by Module 2G (Main Pipeline) — called during generation
export { generateCellColors, applyBiomeColorShift }
export { type ColorGenConfig, type TileColorProfile, type BiomeColorShift }
export { DEFAULT_TILE_COLOR_PROFILES }

// Used by Module 3L (Color Rendering) — called at draw time
export { resolveCellColor }
```

---

## Test Spec

File: `src/game/mapgen/color_test.ts`

```
Deno.test("generateCellColors returns array same size as tiles")
  - Generate colors for a small grid
  - assertEquals(cellColors.length, tiles.length)

Deno.test("generateCellColors is deterministic for same seed")
  - Run twice with same random
  - assertEquals(result1, result2)

Deno.test("color offsets are within [-1, 1] range")
  - Generate colors, verify every CellColor has r, g, b in [-1, 1]

Deno.test("different tile types produce different color ranges")
  - Generate colors for a grid with mixed tiles
  - Group by tile type, compute average offsets
  - Verify they differ (not all identical)

Deno.test("applyBiomeColorShift modifies only masked cells")
  - Apply shift with a partial mask
  - Verify unmasked cells are unchanged
  - Verify masked cells have shifted values

Deno.test("resolveCellColor produces valid hex string")
  - Call with known inputs
  - Verify format matches /^#[0-9a-f]{6}$/

Deno.test("resolveCellColor dims for low visibility")
  - Same cell at visibility 3 vs 1
  - Verify visibility-1 result is darker (lower channel values)

Deno.test("Perlin noise influence creates spatial correlation")
  - Generate colors with perlinInfluence=0.8 on a 50x50 grid
  - Verify adjacent cells have more similar colors than distant cells
  - (Compare average absolute difference of neighbors vs random pairs)
```
