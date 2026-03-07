# Module 2H: Lakes & Open Chambers

**Phase**: 2 (parallel with 2G, 2I, 2J)
**Depends on**: 1B (blobs), 1E (biomes), 1F (pathfinding)
**Creates**: `src/game/mapgen/lakes.ts`, `src/game/mapgen/lakes_test.ts`
**Depended on by**: Module 2G (called from pipeline step 5)

---

## Overview

Brogue places lakes (lava, water, chasms) as CA blobs that overlay the map
without breaking connectivity. The algorithm generates blobs at decreasing
sizes, attempts to place them, and surrounds them with "wreath" terrain.

In Echo Chamber: underwater caverns, kelp groves, sand flats, thermal vent
clearings, abyssal drops. Each lake type fills with a specific tile and has
a characteristic wreath terrain around its perimeter.

---

## Types

```typescript
import type { TileKind, Point } from "../tiles.ts"
import type { Blob, BlobParams } from "./blob.ts"
import type { BiomeZone } from "./biomes.ts"

export type LakeStyle = "open-cavern" | "kelp-grove" | "sand-flat" | "vent-field" | "abyss-drop"

export interface LakeDefinition {
  readonly style: LakeStyle
  readonly fillTile: TileKind          // what the lake interior becomes
  readonly wreathTile: TileKind        // what the lake perimeter becomes
  readonly wreathWidth: number         // how many cells of wreath around the blob
  readonly frequencyWeight: number     // relative spawn weight
  readonly minArea: number             // minimum blob area to accept
  readonly blobParams: BlobParams      // CA params for generating the blob shape
}

export interface PlacedLake {
  readonly style: LakeStyle
  readonly position: Point             // top-left of blob bounding box on the map
  readonly blob: Blob
  readonly wreathCells: Point[]
}

export interface LakePlacementResult {
  readonly tiles: TileKind[]
  readonly lakes: PlacedLake[]
}
```

---

## Lake Catalog

```typescript
export const LAKE_DEFINITIONS: readonly LakeDefinition[] = [
  {
    style: "open-cavern",
    fillTile: "water",
    wreathTile: "sand",
    wreathWidth: 1,
    frequencyWeight: 30,
    minArea: 20,
    blobParams: BLOB_PRESETS.standard,
  },
  {
    style: "kelp-grove",
    fillTile: "kelp",
    wreathTile: "water",
    wreathWidth: 1,
    frequencyWeight: 20,
    minArea: 12,
    blobParams: BLOB_PRESETS.dense,
  },
  {
    style: "sand-flat",
    fillTile: "sand",
    wreathTile: "shallows",
    wreathWidth: 2,
    frequencyWeight: 15,
    minArea: 15,
    blobParams: BLOB_PRESETS.dense,
  },
  {
    style: "vent-field",
    fillTile: "vent",
    wreathTile: "water",
    wreathWidth: 1,
    frequencyWeight: 8,
    minArea: 6,
    blobParams: BLOB_PRESETS.sparse,
  },
  {
    style: "abyss-drop",
    fillTile: "abyss",
    wreathTile: "shallows",
    wreathWidth: 2,
    frequencyWeight: 5,
    minArea: 10,
    blobParams: BLOB_PRESETS.standard,
  },
]
```

---

## Core Algorithm

```typescript
/**
 * Place lakes within a biome zone.
 * Called once per zone from the main pipeline.
 */
export function placeLakes(
  tiles: TileKind[],
  width: number,
  height: number,
  zone: BiomeZone,
  spawn: Point,
  capsule: Point,
  random: () => number,
): LakePlacementResult

Algorithm:
  lakes: PlacedLake[] = []
  maxLakes = zone.profile.maxLakes

  // Attempt sizes from large to small (Brogue pattern)
  sizeAttempts = [
    { w: 30, h: 15 },
    { w: 25, h: 12 },
    { w: 20, h: 10 },
    { w: 15, h: 8 },
    { w: 10, h: 6 },
  ]

  For each sizeAttempt in sizeAttempts:
    if lakes.length >= maxLakes: break

    // Select lake style by weighted random
    lakeDef = weightedChoice(LAKE_DEFINITIONS, d => d.frequencyWeight, random)

    // Generate blob
    blob = generateBlob(sizeAttempt.w, sizeAttempt.h, lakeDef.blobParams, random)
    blob = trimBlob(blob)

    if blob.area < lakeDef.minArea: continue

    // Try to place the blob within this zone
    placement = findLakePlacement(
      tiles, width, height,
      zone, blob, lakeDef,
      spawn, capsule,
      random,
    )

    if placement is null: continue

    // Apply the lake to the tile grid
    applyLake(tiles, width, height, blob, placement, lakeDef)

    // Collect wreath cells
    wreathCells = applyWreath(tiles, width, height, blob, placement, lakeDef)

    lakes.push({
      style: lakeDef.style,
      position: placement,
      blob,
      wreathCells,
    })

  Return { tiles, lakes }
```

### Lake Placement Validation

```typescript
function findLakePlacement(
  tiles: TileKind[],
  width: number,
  height: number,
  zone: BiomeZone,
  blob: Blob,
  lakeDef: LakeDefinition,
  spawn: Point,
  capsule: Point,
  random: () => number,
  maxAttempts: number = 50,
): Point | null

Algorithm:
  For attempt in 0..maxAttempts:
    // Random position within zone bounds (with margin)
    ox = randomInteger(random, zone.bounds.x + 2, zone.bounds.x + zone.bounds.width - blob.width - 2)
    oy = randomInteger(random, 2, height - blob.height - 2)

    // Check 1: blob fits within zone
    if any blob cell falls outside zone mask: continue

    // Check 2: blob doesn't overlap spawn or capsule (with margin of 3)
    if any blob cell is within chebyshev distance 3 of spawn or capsule: continue

    // Check 3: connectivity check
    // Simulate applying the lake, then verify spawn-capsule path still exists
    changes = []
    for each blob cell (bx, by) where blob.cells[by*blob.width+bx] is true:
      mapIndex = (oy + by) * width + (ox + bx)
      if lakeDef.fillTile is not passable and tiles[mapIndex] is passable:
        changes.push({ index: mapIndex, newTile: lakeDef.fillTile })

    if wouldDisconnect(tiles, width, height, changes, [[spawn, capsule]]):
      continue

    return { x: ox, y: oy }

  Return null
```

### Apply Lake and Wreath

```typescript
function applyLake(
  tiles: TileKind[], width: number, height: number,
  blob: Blob, offset: Point, lakeDef: LakeDefinition,
): void
  For each blob cell where blob.cells[i] is true:
    mapX = offset.x + (i % blob.width)
    mapY = offset.y + Math.floor(i / blob.width)
    if isInterior(width, height, mapX, mapY):
      tiles[mapY * width + mapX] = lakeDef.fillTile

function applyWreath(
  tiles: TileKind[], width: number, height: number,
  blob: Blob, offset: Point, lakeDef: LakeDefinition,
): Point[]
  wreathCells = []
  perimeter = blobPerimeter(blob)  // from Module 1B

  For each perimeterCell:
    For radius 1..lakeDef.wreathWidth:
      For each neighbor at distance radius:
        mapX = offset.x + neighbor.x
        mapY = offset.y + neighbor.y
        if not isInterior(width, height, mapX, mapY): continue
        mapIndex = mapY * width + mapX
        // Only wreath onto wall tiles (don't overwrite existing features)
        if tiles[mapIndex] === "wall":
          tiles[mapIndex] = lakeDef.wreathTile
          wreathCells.push({ x: mapX, y: mapY })

  Return wreathCells
```

---

## Integration Contract

```typescript
// Used by Module 2G (Main Pipeline) — step 5
export { placeLakes }
export { type LakePlacementResult, type PlacedLake, type LakeStyle }
export { LAKE_DEFINITIONS }
```

---

## Test Spec

File: `src/game/mapgen/lakes_test.ts`

```
Deno.test("placeLakes is deterministic for same seed")
  - Run twice → same lake positions and types

Deno.test("placed lakes do not disconnect spawn from capsule")
  - Place lakes, then BFS spawn → capsule → path must exist

Deno.test("lake interior cells have the correct fill tile")
  - After placement, verify cells within blob bounds match fillTile

Deno.test("wreath surrounds lake perimeter")
  - After placement, verify wreath cells are adjacent to lake cells
  - Verify wreath cells have wreathTile

Deno.test("lakes stay within zone bounds")
  - All lake cells fall within the assigned zone's mask

Deno.test("lakes do not overlap spawn or capsule")
  - Verify no lake cell is within distance 3 of spawn/capsule

Deno.test("lake count does not exceed zone maxLakes")
  - Verify lakes.length <= zone.profile.maxLakes

Deno.test("lakes with impassable fill tiles don't block connectivity")
  - Place a lake with fillTile that is impassable (hypothetical)
  - Verify connectivity is maintained
```
