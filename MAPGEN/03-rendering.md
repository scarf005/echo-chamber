# Phase 3: Rendering Updates (Modules K, L, M)

**Phase**: 3 (parallel — all three modules can be implemented simultaneously)
**Depends on**: Phase 0 (`TileKind`, `TILE_PROPERTIES`, `CellColor`, `LightSource`), Module 1C (`resolveCellColor`, `TileColorProfile`)
**Modifies**: `src/render/layers/tileMemory.ts`, `src/render/helpers/selectors.ts`, `src/render/colors.ts`, `src/render/helpers/draw.ts`
**Creates**: `src/render/helpers/lighting.ts`, `src/render/helpers/lighting_test.ts`

---

## Overview

The current renderer only knows two tile types: `"wall"` and `"water"`. Every tile color is a flat
constant from `COLORS`. This phase replaces the hardcoded two-branch renderer with a data-driven
system that handles all 10 `TileKind` values, uses per-cell color from the generation phase, and
composites a light map for atmospheric effects (bioluminescence, thermal glow).

---

## Module 3K: Tile Rendering

### Current State (`tileMemory.ts`, 56 lines)

```typescript
// Two branches — wall or water, nothing else
if (memory === "wall") {
  drawTileBackground(ctx, sx, sy, ts, visibility >= 2 ? COLORS.visibleWall : COLORS.memoryWall, 1)
  drawGlyph(ctx, sx, sy, ts, wallGlyphForMask(game, x, y), COLORS.background, ...)
} else if (memory === "water") {
  drawTileBackground(ctx, sx, sy, ts, visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater, ...)
  drawGlyph(ctx, sx, sy, ts, visibility >= 2 ? "." : "·", ...)
}
```

### New Implementation

Replace the `if/else` chain with a single lookup-driven path:

```typescript
import { TILE_PROPERTIES, isAutotiled, type TileKind } from "../../game/tiles.ts"
import { resolveCellColor } from "../../game/mapgen/color.ts"
import { solidTileGlyphForMask } from "../helpers/selectors.ts"

export function drawTileMemoryLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  index: number,
  x: number,
  y: number,
  tileSize: number,
): void {
  const visibility = game.visibility[index]
  const memory = game.memory[index]

  if (memory === null) return

  const props = TILE_PROPERTIES[memory]
  const cellColor = game.map.cellColors[index]
  const lightLevel = game.map.lightMap[index]

  // Resolve final color from base + offset + light + visibility
  const color = resolveCellColor(memory, cellColor, lightLevel, visibility)

  // Background fill
  const bgAlpha = props.category === "liquid"
    ? (visibility >= 2 ? 0.14 : 0.08)
    : 1
  drawTileBackground(context, x * tileSize, y * tileSize, tileSize, color, bgAlpha)

  // Glyph selection
  const glyph = isAutotiled(memory)
    ? solidTileGlyphForMask(game, x, y)
    : (visibility >= 2 ? props.glyph : props.memoryGlyph)

  const glyphColor = props.category === "solid"
    ? COLORS.background   // dark glyph on light solid
    : color               // colored glyph on dark liquid/feature

  const glyphAlpha = visibility >= 2 ? 0.92 : 0.65

  drawGlyph(context, x * tileSize, y * tileSize, tileSize, glyph, glyphColor, glyphAlpha)
}
```

### Per-Tile Rendering Details

| TileKind   | Background | Glyph | Autotile | Notes |
|------------|-----------|-------|----------|-------|
| `water`    | resolved color, alpha 0.14/0.08 | `.` / `·` | no | Same as current, but with per-cell color |
| `wall`     | resolved color, alpha 1.0 | box-drawing (bitmask) | yes | Existing behavior, now data-driven |
| `bedrock`  | resolved color (darker), alpha 1.0 | box-drawing (bitmask) | yes | Like wall but darker, never shows cracks |
| `sand`     | resolved color, alpha 0.14/0.08 | `≈` / `~` | no | Pale yellow base from TileColorProfile |
| `kelp`     | resolved color, alpha 0.14/0.08 | `¥` | no | Dark green; optional swaying via `(game.turn % 8)` alpha shift |
| `coral`    | resolved color, alpha 1.0 | box-drawing (bitmask) | yes | Pinkish base; autotiles like wall |
| `vent`     | resolved color, alpha 0.14/0.08 | `^` | no | Orange-red; periodic alpha pulse `0.7 + 0.3 * sin(turn * 0.5)` |
| `current`  | resolved color, alpha 0.14/0.08 | `~` | no | Blue-shifted; could add direction arrow overlay |
| `shallows` | resolved color, alpha 0.14/0.08 | `,` | no | Light teal |
| `abyss`    | resolved color, alpha 0.04 | ` ` (space) | no | Near-black; almost invisible |

### Animated Tiles (Optional Enhancement)

Some tiles benefit from subtle per-turn animation. This is **purely cosmetic** and can be deferred:

```typescript
function animatedGlyphAlpha(tile: TileKind, turn: number, baseAlpha: number): number {
  switch (tile) {
    case "kelp":
      return baseAlpha * (0.85 + 0.15 * Math.sin(turn * 0.3))   // gentle sway
    case "vent":
      return baseAlpha * (0.7 + 0.3 * Math.sin(turn * 0.5))     // thermal pulse
    case "current":
      return baseAlpha * (0.8 + 0.2 * Math.sin(turn * 0.4))     // flow shimmer
    default:
      return baseAlpha
  }
}
```

---

## Module 3K (continued): Selectors Update

### Rename: `wallGlyphForMask` → `solidTileGlyphForMask`

In `src/render/helpers/selectors.ts`:

```typescript
// BEFORE
export function wallGlyphForMask(game: GameState, x: number, y: number): string {
  const mask = Number(isKnownWall(game, x, y - 1)) | ...
  // ...
}

function isKnownWall(game: GameState, x: number, y: number): boolean {
  return game.memory[y * game.map.width + x] === "wall"
}

// AFTER
import { isSolidTile } from "../../game/tiles.ts"

export function solidTileGlyphForMask(game: GameState, x: number, y: number): string {
  const mask = Number(isKnownSolid(game, x, y - 1)) |
    (Number(isKnownSolid(game, x + 1, y)) << 1) |
    (Number(isKnownSolid(game, x, y + 1)) << 2) |
    (Number(isKnownSolid(game, x - 1, y)) << 3)
  // switch statement unchanged — same box-drawing glyphs
}

function isKnownSolid(game: GameState, x: number, y: number): boolean {
  if (x < 0 || x >= game.map.width || y < 0 || y >= game.map.height) return false
  return isSolidTile(game.memory[y * game.map.width + x])
}
```

Now `wall`, `bedrock`, and `coral` all participate in autotiling. A coral formation adjacent to
a wall seamlessly connects via box-drawing characters.

---

## Module 3L: Color Rendering

### Current State (`colors.ts`, 20 lines)

Flat palette object — every wall is the same `#284248`, every water tile is `#3a6f7b`.

### Changes

1. **Keep `COLORS` for non-tile elements** (player, torpedo, capsule, trail, dust, etc.) — unchanged.
2. **Remove tile-specific entries** (`memoryWall`, `visibleWall`, `memoryWater`, `visibleWater`) after migration.
3. **Tile colors now come from `resolveCellColor()`** (defined in Module 1C, `src/game/mapgen/color.ts`).

### Updated `COLORS` Object

```typescript
export const COLORS = {
  background: "#02070c",
  // memoryWater, visibleWater, memoryWall, visibleWall → REMOVED (use resolveCellColor)
  player: "#ffc857",
  capsule: "#ff6b6b",
  hostileSubmarine: "#ff8c69",
  trail: "#9ad9ff",
  dust: "#8c7a5b",
  dustGlow: "#382e23",
  sonar: "#8af4ff",
  sonarGlow: "#123348",
  torpedo: "#ffe28a",
  depthCharge: "#ff9f6e",
  pickup: "#b7ff8a",
  crack: "#f7deb3",
  boulder: "#c7b48f",
} as const
```

### Color Resolution Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ TileKind    │     │ CellColor    │     │ LightMap     │
│ (from tile) │────>│ (from gen)   │────>│ (from gen)   │──> resolveCellColor()
└─────────────┘     └──────────────┘     └──────────────┘         │
                                                                   v
                    ┌──────────────┐     ┌──────────────┐   ┌──────────┐
                    │ TileColor    │     │ Visibility   │   │ "#rrggbb"|
                    │ Profile      │────>│ Level        │──>│  final   │
                    │ (base color) │     │ (0-3)        │   │  color   │
                    └──────────────┘     └──────────────┘   └──────────┘
```

The `resolveCellColor` function (spec in `01c-color-atmosphere.md`) takes:
- `tile: TileKind` — selects the `TileColorProfile` (base RGB + variance range)
- `cellColor: CellColor` — per-cell offset generated at map creation (`r`, `g`, `b` in -1..1)
- `lightLevel: number` — from `lightMap[]` (0.0–1.0)
- `visibility: 0 | 1 | 2 | 3` — current FOW state

Returns a CSS hex string `"#rrggbb"`.

---

## Module 3M: Feature & Lighting Rendering

### New File: `src/render/helpers/lighting.ts`

Computes the `lightMap[]` parallel array at generation time.

### Types

```typescript
import type { LightSource } from "../../game/tiles.ts"

/** Configuration for light map computation */
export interface LightingConfig {
  readonly ambientLevel: number    // base illumination everywhere (default 0.15)
  readonly maxIntensity: number    // cap per-cell illumination (default 1.0)
}

export const DEFAULT_LIGHTING_CONFIG: LightingConfig = {
  ambientLevel: 0.15,
  maxIntensity: 1.0,
}
```

### Core Algorithm: `computeLightMap`

```typescript
/**
 * Compute illumination for every cell from an array of light sources.
 * Returns a parallel array (same indexing as tiles[]) of values in [0, 1].
 *
 * Called ONCE at generation time, stored on GeneratedMap.lightMap.
 */
export function computeLightMap(
  lightSources: LightSource[],
  width: number,
  height: number,
  config?: LightingConfig,
): number[]

Algorithm:
  1. Initialize lightMap = new Array(width * height).fill(config.ambientLevel)

  2. For each light source:
     a. Compute bounding box: [x - radius, x + radius] × [y - radius, y + radius]
     b. Clamp to map bounds
     c. For each cell (cx, cy) in bounding box:
        distance = euclidean(source.position, {cx, cy})
        if distance > source.radius: skip

        // Inverse-square falloff with fade factor
        normalizedDist = distance / source.radius
        attenuation = (1 - normalizedDist * source.fadePercent) ^ 2
        contribution = Math.max(0, attenuation)

        index = cy * width + cx
        lightMap[index] = Math.min(
          config.maxIntensity,
          lightMap[index] + contribution
        )

  3. Return lightMap
```

### Light Source Styles (cosmetic mapping)

The `LightSource.style` field maps to rendering hints:

| Style | Color Tint | Behavior |
|-------|-----------|----------|
| `"bioluminescent"` | Soft cyan-green `{r:0.3, g:0.9, b:0.8}` | Steady glow, wide radius |
| `"thermal"` | Warm orange `{r:0.9, g:0.5, b:0.2}` | Slight pulse, medium radius |
| `"mineral"` | Cool blue-white `{r:0.7, g:0.7, b:1.0}` | Steady, small radius |
| `"sonar"` | Bright cyan `{r:0.5, g:0.9, b:1.0}` | Dynamic (not pre-computed) |

The `"sonar"` style is NOT included in the static `lightMap` — it is rendered dynamically
by the existing shockwave system. Only `"bioluminescent"`, `"thermal"`, and `"mineral"`
contribute to the precomputed `lightMap`.

### Light Color Blending

Light sources have a color. The `resolveCellColor` function uses only the scalar `lightLevel`
(intensity). To blend the light's color tint with the tile color:

```typescript
/**
 * Blend light source colors into the resolved tile color.
 * Called AFTER resolveCellColor for cells with lightLevel > ambient.
 *
 * Optional enhancement — can be deferred to post-MVP.
 */
export function blendLightColor(
  baseHex: string,              // output of resolveCellColor
  lightSources: LightSource[],  // nearby sources
  cellX: number,
  cellY: number,
): string

Algorithm:
  1. Parse baseHex into {r, g, b}
  2. For each light source within range:
     weight = contribution / totalContribution  (proportional blend)
     r += source.color.r * weight * 0.3   // subtle tint, 30% max
     g += source.color.g * weight * 0.3
     b += source.color.b * weight * 0.3
  3. Clamp [0, 255], return hex
```

### FOV Masking

Lights are only visible if the player has ever seen the cell:

```typescript
// In drawTileMemoryLayer:
const lightLevel = visibility > 0
  ? game.map.lightMap[index]   // player has seen this cell — show lighting
  : DEFAULT_LIGHTING_CONFIG.ambientLevel  // never seen — ambient only
```

---

## Integration Contract

```typescript
// From src/render/helpers/lighting.ts (NEW)
export { computeLightMap, blendLightColor }
export { type LightingConfig, DEFAULT_LIGHTING_CONFIG }

// From src/render/helpers/selectors.ts (MODIFIED)
export { solidTileGlyphForMask }  // renamed from wallGlyphForMask

// From src/render/layers/tileMemory.ts (MODIFIED)
export { drawTileMemoryLayer }    // signature unchanged, implementation data-driven

// From src/render/colors.ts (MODIFIED)
export { COLORS }                 // tile color entries removed
```

---

## Dependencies Summary

```
Phase 0: TileKind, TILE_PROPERTIES, CellColor, LightSource
    ↓
Module 1C: resolveCellColor(), DEFAULT_TILE_COLOR_PROFILES
    ↓
Module 2G: GeneratedMap now has cellColors[], lightSources[], lightMap[]
    ↓
Phase 3 (this doc):
  ├─ 3K: tileMemory.ts uses TILE_PROPERTIES + resolveCellColor
  ├─ 3L: colors.ts drops tile entries; tileMemory.ts calls resolveCellColor
  └─ 3M: lighting.ts computes lightMap from lightSources
```

---

## Test Spec

### File: `src/render/helpers/lighting_test.ts`

```
Deno.test("computeLightMap returns array sized width * height")
  - Generate lightMap for a 10x10 grid with no sources
  - assertEquals(lightMap.length, 100)

Deno.test("computeLightMap has ambient level everywhere when no sources")
  - All cells equal DEFAULT_LIGHTING_CONFIG.ambientLevel (0.15)

Deno.test("computeLightMap increases illumination near a light source")
  - Place one source at (5, 5) with radius 3
  - Verify lightMap at (5, 5) > ambientLevel
  - Verify lightMap at (5, 5) > lightMap at (5, 8)  // (5,8) is outside radius

Deno.test("computeLightMap clamps to maxIntensity")
  - Place multiple overlapping sources at same point
  - Verify no cell exceeds config.maxIntensity (1.0)

Deno.test("computeLightMap is deterministic")
  - Same inputs → same outputs (no randomness in light computation)

Deno.test("computeLightMap respects bounding box — distant cells unaffected")
  - Place source at (0, 0) radius 2
  - Verify cell (9, 9) on a 10x10 grid is at ambient level
```

### File: `src/render/helpers/selectors_test.ts`

```
Deno.test("isKnownSolid returns true for wall, bedrock, coral in memory")
  - Mock game with memory containing each solid type
  - Verify isKnownSolid returns true

Deno.test("isKnownSolid returns false for water, sand, kelp, etc.")
  - Verify non-solid tiles return false

Deno.test("solidTileGlyphForMask returns box-drawing for surrounded solid")
  - 3x3 grid of wall → center glyph is "┼"

Deno.test("solidTileGlyphForMask works with mixed solid types")
  - Wall next to coral → both participate in adjacency bitmask
```

### File: `src/render/layers/tileMemory_test.ts`

```
Deno.test("drawTileMemoryLayer handles all 10 TileKind values without error")
  - Mock CanvasRenderingContext2D
  - Call drawTileMemoryLayer for each TileKind
  - Verify no exceptions thrown

Deno.test("drawTileMemoryLayer skips null memory")
  - memory[index] = null → no draw calls
```

---

## Verification Commands

```bash
deno test src/render/helpers/lighting_test.ts
deno test src/render/helpers/selectors_test.ts
deno test src/render/layers/tileMemory_test.ts
deno task build
```

---

## Migration Notes

- The `COLORS.memoryWall`, `COLORS.visibleWall`, `COLORS.memoryWater`, `COLORS.visibleWater`
  entries should be removed ONLY after `tileMemory.ts` is fully migrated to `resolveCellColor`.
  During transition, both can coexist.
- `wallGlyphForMask` should be aliased as `solidTileGlyphForMask` with a deprecation re-export
  until all call sites are updated.
- The `game.map.cellColors` and `game.map.lightMap` arrays must be initialized even if using
  the old `generateMap()` — fill with neutral `{r:0, g:0, b:0}` and `0.5` respectively.
