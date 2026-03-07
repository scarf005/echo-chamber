# Phase 4: Integration, Migration & Testing

**Phase**: 4 (sequential — runs after ALL Phase 1–3 modules are complete)
**Depends on**: ALL previous phases and modules
**Modifies**: `src/game/state.ts`, `src/game/systems/destruction.ts`, `src/game/systems/shockwaves.ts`, `src/render/helpers/selectors.ts`, `src/render/colors.ts`, `src/game/items.ts`
**Creates**: `src/game/integration_test.ts`

---

## Overview

This phase wires up the new `generateMapV2` pipeline into the game's entry point, migrates every
file that hardcodes `"wall"` or `"water"` string comparisons to use the tile helper functions from
`src/game/tiles.ts`, adds an end-to-end test suite, and provides a visual QA checklist.

No new game mechanics are introduced here — only plumbing, replacement of string literals, and
verification.

---

## Section A: Pipeline Wiring (`state.ts`)

### Current Entry Point

```typescript
// src/game/state.ts (line 10)
import { generateMap } from "./mapgen.ts"

// (line 14–21)
const map = generateMap({
  width: options.width ?? 144,
  height: options.height ?? 84,
  seed: options.seed,
  smoothingIterations: 4,
  topology: 8,
  wallProbability: 0.45,
})
```

### New Entry Point

```typescript
import { generateMapV2 } from "./mapgen/pipeline.ts"
import { determineBiome } from "./mapgen/biomes.ts"

const map = generateMapV2({
  width: options.width ?? 144,
  height: options.height ?? 84,
  seed: options.seed,
  biomeHint: determineBiome(options.seed ?? createRandomSeed()),
})
```

### Full Diff for `state.ts`

```diff
- import { generateMap } from "./mapgen.ts"
+ import { generateMapV2 } from "./mapgen/pipeline.ts"
+ import { determineBiome } from "./mapgen/biomes.ts"

  export function createGame(options: GameOptions = {}): GameState {
-   const map = generateMap({
-     width: options.width ?? 144,
-     height: options.height ?? 84,
-     seed: options.seed,
-     smoothingIterations: 4,
-     topology: 8,
-     wallProbability: 0.45,
-   })
+   const seed = options.seed ?? createRandomSeed()
+   const map = generateMapV2({
+     width: options.width ?? 144,
+     height: options.height ?? 84,
+     seed,
+     biomeHint: determineBiome(seed),
+   })
```

The rest of `createGame()` remains unchanged. `memory`, `entityMemory`, and `visibility` arrays
are sized from `map.tiles.length`, which is the same regardless of which generator produced the map.

---

## Section B: File-by-File Migration Checklist

### B.1: `src/game/systems/destruction.ts` (309 lines)

**New imports needed:**

```typescript
import {
  isDestructible,
  isSolidTile,
  isPassableTile,
  destroyedForm,
} from "../tiles.ts"
```

**Line-by-line changes:**

| Line | Current Code | Replacement | Rationale |
|------|-------------|-------------|-----------|
| 33 | `carveDisc(map.tiles, map.width, map.height, impactPoint, TORPEDO_BLAST_RADIUS)` | `carveDisc` must internally skip `isDestructible() === false` tiles | Bedrock must survive explosions |
| 41 | `carveDisc(map.tiles, map.width, map.height, center, 1)` | Same `carveDisc` fix | Same reason |
| 58 | `if (tile !== "wall")` | `if (!isSolidTile(tile))` | Cracks propagate through any solid tile |
| 69–70 | `canDislodgeBoulder(...)` check, then `map.tiles[...] = "water"` | Keep canDislodgeBoulder but use `destroyedForm(tile)` instead of `"water"` | Coral → shallows, wall → water |
| 99 | `tileAt(map, point.x, point.y) === "wall"` in `canDislodgeBoulder` | `isSolidTile(tileAt(map, point.x, point.y))` | Any solid tile can dislodge |
| 100 | `tileAt(map, point.x, point.y + 1) === "water"` | `isPassableTile(tileAt(map, point.x, point.y + 1))` | Boulder falls into any passable tile |
| 170 | `tileAt(...) !== "wall"` in `releaseFloatingTerrain` | `!isSolidTile(tileAt(...))` | Floating terrain detection for all solids |
| 186 | `tileAt(map, x, y) !== "wall"` | `!isSolidTile(tileAt(map, x, y))` | Same |
| 209 | `map.tiles[cellIndex] = "water"` (floating terrain release) | `map.tiles[cellIndex] = "water"` (keep — released terrain becomes open water) | Floating chunks always become water regardless of original type |
| 239 | `tileAt(...) !== "wall"` in `collectWallComponent` | `!isSolidTile(tileAt(...))` | Component detection for all solids |
| 251 | `tileAt(...) === "wall"` | `isSolidTile(tileAt(...))` | Same |
| 284 | `tileAt(...) !== "wall"` in `pushBorderWall` | `!isSolidTile(tileAt(...))` | Border detection for all solids |

**Additional changes to `carveDisc`** (in `mapgen.ts`):

```typescript
// BEFORE (in carveDisc)
tiles[index] = "water"

// AFTER
const tile = tiles[index]
if (isDestructible(tile)) {
  tiles[index] = destroyedForm(tile)
}
```

**Crack generation** (lines 62–66): Add a guard to skip bedrock:

```typescript
if (!isDestructible(tile)) continue  // bedrock doesn't crack
cracks.push({ ... })
```

### B.2: `src/game/perception.ts` (138 lines)

**No string-literal tile checks exist in this file.**

The only tile interaction is `memory[index] = tile` (line 42, 49) and `tileAt(game.map, x, y)`
(line 32), both of which use the `TileKind` type directly. The wider `TileKind` union flows
through automatically — if `tileAt` returns `"kelp"`, that value is stored in memory correctly.

**Verdict: No changes needed.** Perception works with any `TileKind` value.

### B.3: `src/game/systems/shockwaves.ts` (342 lines)

**New import needed:**

```typescript
import { blocksSonar } from "../tiles.ts"
```

**Single change:**

| Line | Current Code | Replacement | Rationale |
|------|-------------|-------------|-----------|
| 198 | `if (tile === "wall")` | `if (blocksSonar(tile))` | Sonar now blocked by wall, bedrock, kelp, coral (per TILE_PROPERTIES) |

The rest of the sonar ray-tracing logic is unchanged. The `revealedTiles.set(mapIndex, tile)`
calls on lines 201 and 221 already store whatever `TileKind` the tile is — no change needed.

**Behavioral impact:** Kelp forests now block sonar propagation, creating "sonar shadows"
behind kelp patches. Coral formations block sonar like walls. This is a significant gameplay
change that enriches tactical positioning.

### B.4: `src/render/helpers/selectors.ts` (124 lines)

**New import needed:**

```typescript
import { isSolidTile } from "../../game/tiles.ts"
```

**Changes:**

| Line | Current | Replacement |
|------|---------|-------------|
| 76 | `export function wallGlyphForMask(` | `export function solidTileGlyphForMask(` |
| 118 | `function isKnownWall(game, x, y): boolean` | `function isKnownSolid(game, x, y): boolean` |
| 123 | `return game.memory[...] === "wall"` | `return isSolidTile(game.memory[...])` |
| 81–84 | `isKnownWall(game, ...)` (4 calls) | `isKnownSolid(game, ...)` |

**Backward compatibility:** Export a deprecated alias:

```typescript
/** @deprecated Use solidTileGlyphForMask */
export const wallGlyphForMask = solidTileGlyphForMask
```

### B.5: `src/game/items.ts` (207 lines)

**No string-literal tile changes needed.**

The corner pickup placement heuristic uses `isPassableTile()` (already imported from mapgen.ts,
which will re-export from tiles.ts). The logic finds open areas in map corners — this works
regardless of which passable tile types exist.

**Future change (Module 2J integration):** When machines/vaults place items, `createCornerPickups`
becomes a fallback for any remaining items not placed by blueprints. This is handled by the
pipeline, not by changing items.ts itself:

```typescript
// In pipeline (Module 2G):
const machineItems = placeMachineItems(map, blueprints)
const cornerItems = createCornerPickups(map, map.seed)
  .filter(item => !overlapsWithMachineItems(item, machineItems))
const allPickups = [...machineItems, ...cornerItems]
```

### B.6: `src/render/colors.ts` (20 lines)

**Remove tile-specific color entries** after `tileMemory.ts` migration:

```diff
  export const COLORS = {
    background: "#02070c",
-   memoryWater: "#3a6f7b",
-   visibleWater: "#8af4ff",
-   memoryWall: "#284248",
-   visibleWall: "#d7fff8",
    player: "#ffc857",
    // ... rest unchanged
  } as const
```

**Timing:** Remove these entries ONLY after `tileMemory.ts` is fully migrated to `resolveCellColor`.
During the transition period, both can coexist safely.

---

## Section C: Backward Compatibility Strategy

1. **Keep `generateMap()`** as a working export from `src/game/mapgen.ts` — do NOT delete it.
   Existing tests import and call it directly.

2. **`generateMap()` output contract**: Its `GeneratedMap` now has the new fields (`cellColors`,
   `lightSources`, `lightMap`, `currents`, `metadata`), but they are filled with defaults:
   - `cellColors`: all `{r: 0, g: 0, b: 0}` (no variance)
   - `lightSources`: empty `[]`
   - `lightMap`: all `0.5` (neutral illumination)
   - `currents`: empty `Map`
   - `metadata.roomCount`: 0, etc.

3. **Existing test invariants preserved by `generateMapV2()`**:
   - Spawn and capsule are on passable tiles
   - Path exists from spawn to capsule
   - Border tiles are solid (now `"bedrock"` instead of `"wall"`, but `isSolidTile("bedrock") === true`)
   - Map dimensions match input

4. **Re-exports for smooth migration**:
   ```typescript
   // src/game/mapgen.ts — keeps all existing exports
   export { type TileKind, type BiomeKind } from "./tiles.ts"
   export { isPassableTile } from "./tiles.ts"
   // Original generateMap still works
   export { generateMap }
   ```

---

## Section D: New Import Map

Every migrated file needs exactly these imports:

```typescript
// src/game/systems/destruction.ts
import { isDestructible, isSolidTile, isPassableTile, destroyedForm } from "../tiles.ts"

// src/game/systems/shockwaves.ts
import { blocksSonar } from "../tiles.ts"

// src/render/helpers/selectors.ts
import { isSolidTile } from "../../game/tiles.ts"

// src/render/layers/tileMemory.ts
import { TILE_PROPERTIES, isAutotiled } from "../../game/tiles.ts"
import { resolveCellColor } from "../../game/mapgen/color.ts"
import { solidTileGlyphForMask } from "../helpers/selectors.ts"

// src/game/state.ts
import { generateMapV2 } from "./mapgen/pipeline.ts"
import { determineBiome } from "./mapgen/biomes.ts"
```

---

## Section E: End-to-End Test Suite

File: `src/game/integration_test.ts`

```
Deno.test("generateMapV2 produces map with all required fields", () => {
  const map = generateMapV2({ width: 48, height: 24, seed: "integration-1" })
  // Verify all GeneratedMap fields exist
  assert(Array.isArray(map.tiles))
  assert(Array.isArray(map.cellColors))
  assert(Array.isArray(map.lightSources))
  assert(Array.isArray(map.lightMap))
  assert(map.currents instanceof Map)
  assertEquals(map.tiles.length, 48 * 24)
  assertEquals(map.cellColors.length, 48 * 24)
  assertEquals(map.lightMap.length, 48 * 24)
  assert(map.metadata.roomCount >= 0)
})

Deno.test("generateMapV2 backward compat: spawn reachable from capsule", () => {
  const map = generateMapV2({ width: 48, height: 24, seed: "compat-path" })
  // Use pathfinding module to verify connectivity
  const path = bfsPath(map, map.spawn, map.capsule)
  assert(path !== null, "spawn must be reachable from capsule")
})

Deno.test("generateMapV2 backward compat: borders are solid", () => {
  const map = generateMapV2({ width: 48, height: 24, seed: "compat-border" })
  for (let x = 0; x < map.width; x++) {
    assert(isSolidTile(map.tiles[x]), `top border at x=${x} must be solid`)
    assert(isSolidTile(map.tiles[(map.height - 1) * map.width + x]), `bottom border`)
  }
  for (let y = 0; y < map.height; y++) {
    assert(isSolidTile(map.tiles[y * map.width]), `left border at y=${y}`)
    assert(isSolidTile(map.tiles[y * map.width + map.width - 1]), `right border`)
  }
})

Deno.test("generateMapV2 produces tile diversity (not just wall/water)", () => {
  const map = generateMapV2({ width: 72, height: 42, seed: "diverse-tiles" })
  const uniqueTiles = new Set(map.tiles)
  assert(uniqueTiles.size >= 3, `expected >= 3 tile types, got ${uniqueTiles.size}: ${[...uniqueTiles]}`)
})

Deno.test("generateMapV2 is deterministic", () => {
  const map1 = generateMapV2({ width: 48, height: 24, seed: "determinism" })
  const map2 = generateMapV2({ width: 48, height: 24, seed: "determinism" })
  assertEquals(map1.tiles, map2.tiles)
  assertEquals(map1.cellColors, map2.cellColors)
  assertEquals(map1.lightMap, map2.lightMap)
  assertEquals(map1.spawn, map2.spawn)
  assertEquals(map1.capsule, map2.capsule)
})

Deno.test("destruction respects bedrock — torpedo near bedrock does not carve it", () => {
  // Create a small map with bedrock at a known position
  const map = generateMapV2({ width: 48, height: 24, seed: "bedrock-test" })
  // Find a bedrock cell (border cells are bedrock)
  const bedrockIndex = 0  // top-left corner
  assertEquals(map.tiles[bedrockIndex], "bedrock")

  // Detonate torpedo adjacent to it
  const result = detonateTorpedo(map, { x: 2, y: 1 }, "bedrock-blast")
  assertEquals(map.tiles[bedrockIndex], "bedrock", "bedrock must survive explosion")
})

Deno.test("sonar blocked by kelp — shockwave stops at kelp tile", () => {
  // Manually place kelp in a small map to test sonar blocking
  // Verify that tiles behind kelp are NOT revealed by shockwave
})

Deno.test("autotiling includes coral — solidTileGlyphForMask handles coral", () => {
  // Create mock game where memory has coral tiles
  // Verify solidTileGlyphForMask returns box-drawing glyphs for coral
  // Verify coral adjacent to wall connects seamlessly
})

Deno.test("resolveCellColor produces valid hex for all 10 tile types", () => {
  const allTiles: TileKind[] = [
    "water", "wall", "bedrock", "sand", "kelp",
    "coral", "vent", "current", "shallows", "abyss",
  ]
  for (const tile of allTiles) {
    const color = resolveCellColor(tile, { r: 0, g: 0, b: 0 }, 0.5, 2)
    assert(color.match(/^#[0-9a-f]{6}$/), `invalid color for ${tile}: ${color}`)
  }
})

Deno.test("lightMap values are in [0, 1] range", () => {
  const map = generateMapV2({ width: 48, height: 24, seed: "light-range" })
  for (const value of map.lightMap) {
    assert(value >= 0 && value <= 1, `lightMap value out of range: ${value}`)
  }
})

Deno.test("createGame with generateMapV2 produces playable GameState", () => {
  const game = createGame({ seed: "smoke-test" })
  assert(game.status === "playing")
  assert(game.player.x >= 0 && game.player.x < game.map.width)
  assert(game.player.y >= 0 && game.player.y < game.map.height)
  assert(game.memory.length === game.map.tiles.length)
  assert(game.visibility.length === game.map.tiles.length)
})
```

---

## Section F: Visual QA Checklist (Manual / Playwright)

After all code changes are complete, verify visually:

- [ ] **No missing tiles**: Every cell renders something (no blank spots)
- [ ] **Kelp forests**: Green `¥` glyphs visible in map
- [ ] **Coral formations**: Pink/red autotiled glyphs connecting like walls
- [ ] **Bedrock borders**: Darker solid border, distinct from regular walls
- [ ] **Sand areas**: Pale yellow `≈` glyphs in bottom regions
- [ ] **Thermal vents**: Orange `^` glyphs with subtle pulse
- [ ] **Bioluminescence**: Soft cyan-green glow halos around light sources
- [ ] **Abyss**: Near-black empty areas
- [ ] **Color variance**: Adjacent wall tiles have slightly different shades (not flat)
- [ ] **Sonar interaction**: Sonar wave stops at kelp/coral boundaries
- [ ] **Torpedo vs bedrock**: Explosion near border doesn't carve border
- [ ] **Autotiling**: Wall-coral junctions use connected box-drawing chars
- [ ] **Memory rendering**: Previously seen tiles render with dimmed colors
- [ ] **Performance**: No visible lag on 144×84 map with full lighting

---

## Section G: Migration Order

Execute these in order to minimize broken intermediate states:

1. **Phase 0**: Create `tiles.ts` with types and helpers. Re-export from `mapgen.ts`.
   - Run: `deno test src/game/mapgen_test.ts` — must pass (backward compat)

2. **Phase 1** (parallel): Implement all six Phase 1 modules in `src/game/mapgen/` directory.
   - Each module has its own test file. Run individually.

3. **Phase 2** (parallel): Pipeline, lakes, loops, machines.
   - Run: `deno test src/game/mapgen/` — all module tests pass

4. **Phase 3** (parallel): Rendering updates.
   - Run: `deno task build` — no type errors

5. **Phase 4 migration** (sequential, in this order):
   a. `destruction.ts` — swap string literals for helper calls
   b. `shockwaves.ts` — single `blocksSonar` replacement
   c. `selectors.ts` — rename + `isSolidTile` replacement
   d. `tileMemory.ts` — full data-driven rewrite
   e. `colors.ts` — remove tile color entries
   f. `state.ts` — switch to `generateMapV2`
   g. `items.ts` — no changes needed now; machine integration is in pipeline

6. **Run full test suite**: `deno test`
7. **Run build**: `deno task build`
8. **Visual QA**: Launch dev server, inspect rendered map

---

## Section H: Verification Commands

```bash
# After each migration step
deno test src/game/mapgen_test.ts          # old tests still pass
deno test src/game/systems/destruction_test.ts  # if exists
deno test src/game/integration_test.ts     # new end-to-end tests

# After all migration complete
deno test                                   # full suite
deno task build                            # type check + bundle
deno task dev                              # visual inspection
```

---

## Section I: Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Coral autotiling looks wrong when adjacent to wall | Visual glitch | Both are `category: "solid"` — bitmask treats them identically. Test with mixed adjacency. |
| `destroyedForm("coral") = "shallows"` might feel wrong | Gameplay surprise | Document in help text: "Coral crumbles into shallow rubble" |
| Kelp blocking sonar is too powerful | Balance issue | Kelp patches are small (feature autogen limits). Can tune `blocksSonar` to false if needed. |
| `lightMap` computation too slow for 144×84 | Performance | Computed once at gen time, not per frame. 12,096 cells × ~10 sources = trivial. |
| Old saves incompatible | Data loss | No save system exists yet — not a concern. |
| `generateMap()` and `generateMapV2()` both exist | Confusion | Mark `generateMap` as `@deprecated` with JSDoc. Remove after all tests migrate. |
