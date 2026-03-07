# Phase 0: Foundation Types & Tile System

**Phase**: 0 (sequential — blocks ALL subsequent phases)
**Creates**: `src/game/tiles.ts`
**Modifies**: `src/game/mapgen.ts`, `src/game/model.ts`

This phase establishes the expanded type system that every other module depends on.
It MUST be completed before any Phase 1 work begins.

---

## New File: `src/game/tiles.ts`

Single source of truth for tile definitions, property lookups, and terrain behavior.

### TileKind (expanded)

```typescript
export type TileKind =
  | "water"          // Open water — default passable tile
  | "wall"           // Rock wall — standard impassable, destructible
  | "bedrock"        // Indestructible wall (border, structural pillars)
  | "sand"           // Sandy floor — passable, movement cost 1.5x
  | "kelp"           // Kelp forest — passable, blocks sonar propagation
  | "coral"          // Coral formation — impassable, destructible (fragile)
  | "vent"           // Thermal vent — passable, periodic area damage
  | "current"        // Water current — passable, pushes entities
  | "shallows"       // Shallow water — passable, reduced sonar range
  | "abyss"          // Deep drop — passable, one-way (entity sinks)
```

### Tile Properties Table

```typescript
export interface TileProperties {
  readonly passable: boolean
  readonly destructible: boolean
  readonly blocksSonar: boolean
  readonly blocksLight: boolean
  readonly movementCost: number       // 1.0 = normal, 1.5 = slow, 0 = impassable
  readonly glyph: string              // default rendering glyph
  readonly memoryGlyph: string        // glyph when remembered but not visible
  readonly autotile: boolean          // whether to use wall-style bitmask autotiling
  readonly category: "solid" | "liquid" | "feature"
}

export const TILE_PROPERTIES: Readonly<Record<TileKind, TileProperties>> = {
  water:    { passable: true,  destructible: false, blocksSonar: false, blocksLight: false, movementCost: 1.0, glyph: ".", memoryGlyph: "·", autotile: false, category: "liquid" },
  wall:     { passable: false, destructible: true,  blocksSonar: true,  blocksLight: true,  movementCost: 0,   glyph: "#", memoryGlyph: "#", autotile: true,  category: "solid" },
  bedrock:  { passable: false, destructible: false, blocksSonar: true,  blocksLight: true,  movementCost: 0,   glyph: "█", memoryGlyph: "█", autotile: true,  category: "solid" },
  sand:     { passable: true,  destructible: false, blocksSonar: false, blocksLight: false, movementCost: 1.5, glyph: "≈", memoryGlyph: "~", autotile: false, category: "liquid" },
  kelp:     { passable: true,  destructible: true,  blocksSonar: true,  blocksLight: false, movementCost: 1.2, glyph: "¥", memoryGlyph: "¥", autotile: false, category: "feature" },
  coral:    { passable: false, destructible: true,  blocksSonar: true,  blocksLight: true,  movementCost: 0,   glyph: "♣", memoryGlyph: "♣", autotile: true,  category: "solid" },
  vent:     { passable: true,  destructible: false, blocksSonar: false, blocksLight: false, movementCost: 1.0, glyph: "^", memoryGlyph: "^", autotile: false, category: "feature" },
  current:  { passable: true,  destructible: false, blocksSonar: false, blocksLight: false, movementCost: 0.8, glyph: "~", memoryGlyph: "~", autotile: false, category: "liquid" },
  shallows: { passable: true,  destructible: false, blocksSonar: false, blocksLight: false, movementCost: 1.0, glyph: ",", memoryGlyph: ",", autotile: false, category: "liquid" },
  abyss:    { passable: true,  destructible: false, blocksSonar: false, blocksLight: false, movementCost: 1.0, glyph: " ", memoryGlyph: " ", autotile: false, category: "liquid" },
} as const
```

### Helper Functions (replace hardcoded checks)

```typescript
/** Replaces current `isPassableTile(tile) => tile === "water"` */
export function isPassableTile(tile: TileKind | null): boolean {
  if (tile === null) return false
  return TILE_PROPERTIES[tile].passable
}

/** Used by destruction.ts — can this tile be carved by explosions? */
export function isDestructible(tile: TileKind | null): boolean {
  if (tile === null) return false
  return TILE_PROPERTIES[tile].destructible
}

/** Used by shockwaves.ts, perception.ts — does this tile block sonar? */
export function blocksSonar(tile: TileKind | null): boolean {
  if (tile === null) return true
  return TILE_PROPERTIES[tile].blocksSonar
}

/** Used by selectors.ts — should this tile use bitmask autotiling? */
export function isAutotiled(tile: TileKind | null): boolean {
  if (tile === null) return false
  return TILE_PROPERTIES[tile].autotile
}

/** Used by selectors.ts — is this tile "solid" for autotiling adjacency? */
export function isSolidTile(tile: TileKind | null): boolean {
  if (tile === null) return true
  return TILE_PROPERTIES[tile].category === "solid"
}

/** What does a destructible tile become when destroyed? */
export function destroyedForm(tile: TileKind): TileKind {
  switch (tile) {
    case "wall": return "water"
    case "coral": return "shallows"
    case "kelp": return "water"
    default: return tile  // indestructible tiles return themselves
  }
}
```

---

## New Types: `CellColor` and `LightSource`

Add to `src/game/tiles.ts`:

```typescript
/** Per-cell color offset, generated at map creation time */
export interface CellColor {
  readonly r: number   // -1.0 to 1.0 offset from base
  readonly g: number
  readonly b: number
}

/** Point light placed during generation */
export interface LightSource {
  readonly position: Point
  readonly radius: number
  readonly color: { r: number; g: number; b: number }
  readonly fadePercent: number  // 0.0–1.0, how much light falls off
  readonly style: "bioluminescent" | "thermal" | "mineral" | "sonar"
}

/** Current direction metadata for current tiles */
export interface CurrentVector {
  readonly dx: number  // -1, 0, or 1
  readonly dy: number  // -1, 0, or 1
  readonly strength: number  // tiles pushed per turn
}
```

---

## Expanded `GeneratedMap` Interface

Modify `src/game/mapgen.ts`:

```typescript
export interface GeneratedMap {
  width: number
  height: number
  tiles: TileKind[]
  cellColors: CellColor[]         // NEW — parallel array, same indexing as tiles
  lightSources: LightSource[]     // NEW — list of point lights
  lightMap: number[]              // NEW — parallel array, computed illumination 0.0–1.0
  currents: Map<number, CurrentVector>  // NEW — sparse map of current tiles to their vectors
  spawn: Point
  capsule: Point
  seed: string
  metadata: MapMetadata
}
```

### Expanded `MapMetadata`

```typescript
export interface MapMetadata {
  mainRouteLength: number
  smoothingIterations: number
  wallProbability: number
  topology: 4 | 6 | 8
  openTileRatio: number
  biomes: BiomeKind[]
  roomCount: number               // NEW
  loopCount: number               // NEW
  lakeCount: number               // NEW
  machineCount: number            // NEW
  featureCounts: Record<string, number>  // NEW — autogenerator feature tallies
}
```

### Expanded `GameState.memory`

In `src/game/model.ts`, the memory array type changes:

```typescript
// BEFORE
memory: Array<TileKind | null>

// AFTER — same type, no change needed
// TileKind is now a wider union, so memory naturally stores the new types
memory: Array<TileKind | null>
```

No structural change to GameState. The wider TileKind union flows through automatically.

---

## Migration Checklist for Phase 0

These are the exact changes needed before Phase 1 can start:

1. **Create** `src/game/tiles.ts` with all types and the `TILE_PROPERTIES` table
2. **Move** `TileKind` and `BiomeKind` definitions from `mapgen.ts` to `tiles.ts`
3. **Re-export** from `mapgen.ts` for backward compatibility: `export { TileKind, BiomeKind } from "./tiles.ts"`
4. **Move** `isPassableTile` from `mapgen.ts` to `tiles.ts` and update its implementation
5. **Re-export** from `mapgen.ts` for backward compatibility
6. **Add** `cellColors`, `lightSources`, `lightMap`, `currents` fields to `GeneratedMap`
7. **Update** `generateMap()` to initialize the new fields with empty/default values (so existing behavior is unchanged)
8. **Update** `cloneMap()` in `helpers.ts` to clone the new fields
9. **Update** `state.ts` `createGame()` — `memory` array still works since TileKind is wider
10. **Run** existing tests — ALL must still pass (backward compatible)

### Verification Commands

```bash
deno test src/game/mapgen_test.ts
deno test src/game/game_test.ts
deno task build
```

---

## Test Spec for Phase 0

File: `src/game/tiles_test.ts`

```typescript
Deno.test("isPassableTile returns true for all passable tiles", () => {
  const passable: TileKind[] = ["water", "sand", "kelp", "vent", "current", "shallows", "abyss"]
  for (const tile of passable) {
    assert(isPassableTile(tile), `${tile} should be passable`)
  }
})

Deno.test("isPassableTile returns false for impassable tiles", () => {
  const impassable: TileKind[] = ["wall", "bedrock", "coral"]
  for (const tile of impassable) {
    assert(!isPassableTile(tile), `${tile} should be impassable`)
  }
})

Deno.test("isPassableTile returns false for null", () => {
  assert(!isPassableTile(null))
})

Deno.test("isDestructible is true for wall, coral, kelp only", () => {
  const destructible: TileKind[] = ["wall", "coral", "kelp"]
  for (const tile of destructible) {
    assert(isDestructible(tile), `${tile} should be destructible`)
  }
})

Deno.test("destroyedForm returns expected transformations", () => {
  assertEquals(destroyedForm("wall"), "water")
  assertEquals(destroyedForm("coral"), "shallows")
  assertEquals(destroyedForm("kelp"), "water")
  assertEquals(destroyedForm("bedrock"), "bedrock")  // indestructible
})

Deno.test("TILE_PROPERTIES has entry for every TileKind", () => {
  // Enumerate all TileKind values and verify each has properties
  const allTiles: TileKind[] = ["water","wall","bedrock","sand","kelp","coral","vent","current","shallows","abyss"]
  for (const tile of allTiles) {
    assert(TILE_PROPERTIES[tile], `missing properties for ${tile}`)
    assert(typeof TILE_PROPERTIES[tile].glyph === "string")
  }
})

Deno.test("existing mapgen tests still pass with expanded TileKind", () => {
  // Re-run core determinism and path tests
  const map = generateMap({ width: 48, height: 24, seed: "phase0-compat" })
  assert(map.tiles.every(t => t === "wall" || t === "water"))  // old generator only uses these two
})
```

---

## Integration Contract

After Phase 0 is complete, ALL other modules may import from `src/game/tiles.ts`:

```typescript
import {
  type TileKind,
  type TileProperties,
  type CellColor,
  type LightSource,
  type CurrentVector,
  TILE_PROPERTIES,
  isPassableTile,
  isDestructible,
  blocksSonar,
  isAutotiled,
  isSolidTile,
  destroyedForm,
} from "./tiles.ts"
```

No module should hardcode tile type strings. Always use `TILE_PROPERTIES` or the helper functions.
