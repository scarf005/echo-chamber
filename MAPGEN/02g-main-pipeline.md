# Module 2G: Main Generation Pipeline

**Phase**: 2 (parallel with 2H, 2I, 2J — but orchestrates the overall flow)
**Depends on**: 1A (rooms), 1B (blobs), 1C (color), 1D (autogen), 1E (biomes), 1F (pathfinding)
**Creates**: `src/game/mapgen/pipeline.ts`, `src/game/mapgen/pipeline_test.ts`
**Modifies**: `src/game/mapgen.ts` (replaces `generateMap` internals)
**Depended on by**: Phase 4 (integration)

---

## Overview

This is the main orchestrator that replaces the current `generateMap()` function
body. It calls the other modules in the correct order, matching Brogue's
pipeline: `clearLevel -> carveDungeon -> designLakes -> fillLakes ->
runAutogenerators -> addMachines -> cleanUpBoundaries -> finishWalls`.

The existing `generateMap()` function signature and `GeneratedMap` return type
are preserved for backward compatibility. The internals are replaced.

---

## Pipeline Steps (in order)

```typescript
export function generateMapV2(options: MapGenOptions = {}): GeneratedMap

Step-by-step:

  1. INITIALIZE
     - Parse options (width, height, seed, etc.) with same defaults as current
     - Save/restore RNG state for determinism (same pattern as current)
     - Initialize tiles[width * height] = all "wall"

  2. SELECT BIOMES
     - biomes = selectBiomes(random)  // from Module 1E
     - zones = assignBiomeZones(width, height, biomes, random)

  3. CARVE ROOMS (Room Accretion) — per biome zone
     For each zone in zones:
       - accretionResult = accreteRooms(
           zone width, zone height,
           zone.profile.targetRoomCount,
           random,
           zone.profile,
         )
       - Stamp accretionResult.tiles onto main tiles[] at zone offset
       - Collect rooms and doorways

  4. ENSURE CONNECTIVITY
     - components = findAllComponents(tiles, width, height)
     - If multiple components:
       For each pair of adjacent components:
         - Find closest pair of cells between them
         - carveLine(tiles, ...) to connect them
     - Final check: bfsPath from spawn region to capsule region

  5. PLACE LAKES & OPEN CHAMBERS — Module 2H
     - For each zone:
       lakePlacement(tiles, width, height, zone, random)
     - Re-verify connectivity after each lake

  6. PUNCH LOOPS — Module 2I
     - loopPunching(tiles, width, height, rooms, random)

  7. RUN AUTOGENERATORS — Module 1D
     - autogenResult = runAutogenerators(tiles, width, height, spawn, capsule, FEATURE_CATALOG, random)
     - Collect light sources

  8. PLACE MACHINES — Module 2J
     - machineResult = placeMachines(tiles, width, height, rooms, random)
     - Collect additional light sources

  9. PLACE SPAWN & CAPSULE
     - Use existing findEdgeAnchor logic but adapted:
       spawn = findEdgeAnchor(tiles, width, height, "left")
       capsule = findEdgeAnchor(tiles, width, height, "right")
     - Ensure both are on passable tiles, carveDisc if needed
     - Verify path exists between them

  10. ENFORCE BORDER
      - enforceBorderWalls(tiles, width, height)
      - Convert border to "bedrock" instead of "wall" (indestructible)

  11. GENERATE COLORS — Module 1C
      - cellColors = generateCellColors(tiles, width, height, colorConfig, random)
      - For each zone: applyBiomeColorShift(cellColors, width, zone.mask, zone.profile.colorShift)

  12. COMPUTE LIGHTING — Module 3M (or inline)
      - lightMap = computeLightMap(tiles, width, height, lightSources)

  13. COMPUTE CURRENTS
      - currents = identifyCurrentCells(tiles, width, height, random)

  14. BUILD METADATA
      - Compute mainRouteLength via bfsPath
      - Count rooms, loops, lakes, features
      - Assemble MapMetadata

  15. RETURN GeneratedMap
      { width, height, tiles, cellColors, lightSources, lightMap, currents,
        spawn, capsule, seed, metadata }
```

---

## Backward Compatibility Strategy

```typescript
// In src/game/mapgen.ts:

// Keep the old generateMap function signature
export function generateMap(options: MapGenOptions = {}): GeneratedMap {
  return generateMapV2(options)
}

// The return type GeneratedMap has new fields (cellColors, lightSources, etc.)
// but all existing code only accesses the old fields, so it works.
// During Phase 4, callers are updated to use new fields.
```

---

## Spawn & Capsule Placement (refined)

```typescript
function placeEndpoints(
  tiles: TileKind[],
  width: number,
  height: number,
  random: () => number,
): { spawn: Point; capsule: Point }

Algorithm:
  1. Find leftmost passable column:
     For x from 1 to width/4:
       candidates = all passable cells in column x
       if candidates.length > 0: break
  2. spawn = random choice from candidates, preferring cells near vertical center
  3. Same for capsule but from right side (x from width-2 down to 3*width/4)
  4. If either not found, carve a small area and place there
  5. Verify bfsPath(spawn, capsule).found
     If not: carveFallbackRoute(tiles, spawn, capsule)
  6. carveDisc around both points (radius 1) for breathing room
```

---

## Integration Contract

```typescript
// Replaces current generateMap internals
export { generateMapV2 }

// Exposed for testing individual pipeline steps
export { placeEndpoints }
```

---

## Test Spec

File: `src/game/mapgen/pipeline_test.ts`

```
Deno.test("generateMapV2 is deterministic for same seed")
  - Run twice with same options → assertEquals

Deno.test("generateMapV2 produces reachable path from spawn to capsule")
  - Generate map, BFS from spawn to capsule → found

Deno.test("generateMapV2 has solid border of bedrock")
  - All border cells should be "bedrock" (not "wall")

Deno.test("generateMapV2 places multiple biome zones")
  - metadata.biomes.length >= 2

Deno.test("generateMapV2 produces varied terrain types")
  - Count distinct TileKind values in tiles
  - Should have at least 3 different types (water, wall, + features)

Deno.test("generateMapV2 cellColors array matches tiles length")
  - assertEquals(map.cellColors.length, map.tiles.length)

Deno.test("generateMapV2 backward compatible with old tests")
  - All existing mapgen_test.ts tests should pass with the new generator
  - (Seed-for-seed output may differ, but structural properties hold)

Deno.test("spawn and capsule are on passable tiles")
  - isPassableTile(tileAt(map, spawn.x, spawn.y)) === true

Deno.test("generateMapV2 multiple seeds produce different layouts")
  - Two different seeds → different tile arrays

Deno.test("lightSources array is non-empty for maps with features")
  - Generate a large map → lightSources.length > 0
```
