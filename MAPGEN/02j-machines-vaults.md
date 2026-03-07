# Module 2J: Machines & Vaults

**Phase**: 2 (parallel with 2G, 2H, 2I)
**Depends on**: 1A (rooms — `PlacedRoom`, `findRoomsByMinSize`), 1D (autogen — `FeatureDefinition`)
**Creates**: `src/game/mapgen/machines.ts`, `src/game/mapgen/machines_test.ts`
**Depended on by**: Module 2G (called from pipeline step 8)

---

## Overview

Brogue's "machines" are handcrafted blueprint templates that create themed
set-pieces: treasure rooms, traps, puzzle areas, altar rooms. Each machine has
a list of features placed relative to an origin point within a qualifying room.

In Echo Chamber: torpedo cache vaults, sonar amplifier chambers, thermal vent
gauntlets, coral garden sanctuaries, mineral deposit veins, abandoned submarine
wrecks, current puzzles.

Machines are placed AFTER room accretion and lake placement. They select
qualifying rooms (by size/shape) and populate them with specific terrain,
items, entities, and light sources.

---

## Types

```typescript
import type { TileKind, Point, LightSource } from "../tiles.ts"
import type { PlacedRoom } from "./rooms.ts"
import type { PickupKind } from "../model.ts"

export type MachinePlacement =
  | "origin"            // at the room center
  | "near_origin"       // within 3 cells of center
  | "far_from_origin"   // at least half the room's radius from center
  | "perimeter"         // on the room's edge cells
  | "random"            // anywhere in the room

export interface MachineFeature {
  readonly terrain?: TileKind        // change this cell's terrain
  readonly item?: PickupKind         // place a pickup item here
  readonly light?: Omit<LightSource, "position">  // place a light source here
  readonly placement: MachinePlacement
  readonly count: number             // how many of this feature to place
  readonly required: boolean         // if true, machine fails if can't place this
}

export interface MachineBlueprint {
  readonly id: string
  readonly displayName: string
  readonly minRoomWidth: number
  readonly minRoomHeight: number
  readonly minRoomArea: number
  readonly frequencyWeight: number   // relative spawn weight
  readonly maxPerMap: number         // max instances of this machine per map
  readonly features: readonly MachineFeature[]
}

export interface PlacedMachine {
  readonly blueprintId: string
  readonly room: PlacedRoom
  readonly origin: Point             // center of the machine
  readonly featurePositions: Array<{ feature: MachineFeature; position: Point }>
}

export interface MachinePlacementResult {
  readonly tiles: TileKind[]
  readonly machines: PlacedMachine[]
  readonly items: Array<{ position: Point; kind: PickupKind }>
  readonly lightSources: LightSource[]
}
```

---

## Machine Catalog

```typescript
export const MACHINE_BLUEPRINTS: readonly MachineBlueprint[] = [
  {
    id: "torpedo-cache",
    displayName: "Torpedo Cache Vault",
    minRoomWidth: 5, minRoomHeight: 4, minRoomArea: 20,
    frequencyWeight: 25,
    maxPerMap: 2,
    features: [
      { terrain: "sand", placement: "origin", count: 1, required: true },
      { item: "torpedo-cache", placement: "origin", count: 1, required: true },
      { terrain: "coral", placement: "perimeter", count: 4, required: false },
      { light: { radius: 4, color: { r: 0.9, g: 0.7, b: 0.3 }, fadePercent: 0.6, style: "mineral" }, placement: "near_origin", count: 1, required: false },
    ],
  },
  {
    id: "depth-charge-cache",
    displayName: "Depth Charge Stockpile",
    minRoomWidth: 4, minRoomHeight: 4, minRoomArea: 16,
    frequencyWeight: 25,
    maxPerMap: 2,
    features: [
      { terrain: "sand", placement: "origin", count: 1, required: true },
      { item: "depth-charge-cache", placement: "origin", count: 1, required: true },
      { terrain: "coral", placement: "perimeter", count: 3, required: false },
    ],
  },
  {
    id: "sonar-amplifier",
    displayName: "Sonar Amplifier Chamber",
    minRoomWidth: 6, minRoomHeight: 5, minRoomArea: 30,
    frequencyWeight: 10,
    maxPerMap: 1,
    features: [
      { terrain: "shallows", placement: "origin", count: 4, required: true },
      { item: "map", placement: "near_origin", count: 1, required: true },
      { light: { radius: 6, color: { r: 0.3, g: 0.8, b: 1.0 }, fadePercent: 0.5, style: "bioluminescent" }, placement: "origin", count: 2, required: false },
    ],
  },
  {
    id: "thermal-gauntlet",
    displayName: "Thermal Vent Gauntlet",
    minRoomWidth: 8, minRoomHeight: 5, minRoomArea: 35,
    frequencyWeight: 12,
    maxPerMap: 1,
    features: [
      { terrain: "vent", placement: "random", count: 6, required: true },
      { terrain: "sand", placement: "far_from_origin", count: 3, required: false },
      { item: "torpedo-cache", placement: "far_from_origin", count: 1, required: true },
      { light: { radius: 4, color: { r: 1.0, g: 0.5, b: 0.2 }, fadePercent: 0.6, style: "thermal" }, placement: "random", count: 3, required: false },
    ],
  },
  {
    id: "coral-garden",
    displayName: "Coral Garden Sanctuary",
    minRoomWidth: 6, minRoomHeight: 5, minRoomArea: 25,
    frequencyWeight: 18,
    maxPerMap: 2,
    features: [
      { terrain: "coral", placement: "random", count: 5, required: true },
      { terrain: "kelp", placement: "random", count: 4, required: false },
      { terrain: "shallows", placement: "perimeter", count: 6, required: false },
      { light: { radius: 3, color: { r: 0.4, g: 0.9, b: 0.6 }, fadePercent: 0.7, style: "bioluminescent" }, placement: "random", count: 2, required: false },
    ],
  },
  {
    id: "mineral-vein",
    displayName: "Mineral Deposit Vein",
    minRoomWidth: 4, minRoomHeight: 3, minRoomArea: 12,
    frequencyWeight: 20,
    maxPerMap: 3,
    features: [
      { terrain: "wall", placement: "perimeter", count: 3, required: true },
      { light: { radius: 3, color: { r: 0.9, g: 0.9, b: 1.0 }, fadePercent: 0.8, style: "mineral" }, placement: "perimeter", count: 3, required: true },
    ],
  },
  {
    id: "current-puzzle",
    displayName: "Current Channel Puzzle",
    minRoomWidth: 8, minRoomHeight: 6, minRoomArea: 40,
    frequencyWeight: 8,
    maxPerMap: 1,
    features: [
      { terrain: "current", placement: "random", count: 8, required: true },
      { terrain: "sand", placement: "random", count: 4, required: false },
      { item: "map", placement: "far_from_origin", count: 1, required: true },
    ],
  },
]
```

---

## Core Algorithm

```typescript
/**
 * Place machines in qualifying rooms.
 */
export function placeMachines(
  tiles: TileKind[],
  width: number,
  height: number,
  rooms: PlacedRoom[],
  random: () => number,
): MachinePlacementResult

Algorithm:
  machines: PlacedMachine[] = []
  items: Array<{ position: Point; kind: PickupKind }> = []
  lights: LightSource[] = []
  usedRooms = new Set<number>()  // room indices already claimed by a machine
  blueprintCounts = new Map<string, number>()  // count per blueprint id

  // Shuffle blueprints for variety
  shuffledBlueprints = weightedShuffle(MACHINE_BLUEPRINTS, b => b.frequencyWeight, random)

  For each blueprint in shuffledBlueprints:
    currentCount = blueprintCounts.get(blueprint.id) ?? 0
    if currentCount >= blueprint.maxPerMap: continue

    // Find qualifying rooms not yet used
    qualifyingRooms = rooms
      .map((room, i) => ({ room, index: i }))
      .filter(({ room, index }) =>
        !usedRooms.has(index) &&
        room.width >= blueprint.minRoomWidth &&
        room.height >= blueprint.minRoomHeight &&
        countOpenCells(room) >= blueprint.minRoomArea
      )

    if qualifyingRooms.length === 0: continue

    // Pick a random qualifying room
    { room, index } = randomChoice(qualifyingRooms, random)

    // Try to place all required features
    result = tryPlaceFeatures(tiles, width, room, blueprint.features, random)

    if result is null: continue  // couldn't satisfy required features

    // Apply features
    for each { feature, position } in result.placements:
      if feature.terrain:
        tiles[position.y * width + position.x] = feature.terrain
      if feature.item:
        items.push({ position, kind: feature.item })
      if feature.light:
        lights.push({ ...feature.light, position })

    usedRooms.add(index)
    blueprintCounts.set(blueprint.id, currentCount + 1)
    machines.push({
      blueprintId: blueprint.id,
      room,
      origin: roomCenter(room),
      featurePositions: result.placements,
    })

  Return { tiles, machines, items, lightSources: lights }
```

### Feature Placement Within a Room

```typescript
function tryPlaceFeatures(
  tiles: TileKind[],
  width: number,
  room: PlacedRoom,
  features: readonly MachineFeature[],
  random: () => number,
): { placements: Array<{ feature: MachineFeature; position: Point }> } | null

Algorithm:
  placements = []
  usedCells = new Set<number>()
  origin = roomCenter(room)

  For each feature in features:
    candidates = getCandidatePositions(room, feature.placement, origin, usedCells)
    shuffle(candidates, random)

    placed = 0
    for each candidate in candidates:
      if placed >= feature.count: break
      index = candidate.y * width + candidate.x
      if usedCells.has(index): continue
      // For terrain features, only place on passable cells (don't block passages)
      if feature.terrain and not isPassableTile(tiles[index]) and feature.terrain is passable: continue

      placements.push({ feature, position: candidate })
      usedCells.add(index)
      placed += 1

    if placed < feature.count and feature.required:
      return null  // can't satisfy required feature

  Return { placements }

function getCandidatePositions(
  room: PlacedRoom,
  placement: MachinePlacement,
  origin: Point,
  usedCells: Set<number>,
): Point[]
  openCells = room cells where room.cells[i] is true
  switch placement:
    "origin": return [origin]
    "near_origin": return openCells.filter(p => chebyshevDistance(p, origin) <= 3)
    "far_from_origin": return openCells.filter(p => chebyshevDistance(p, origin) >= room.width / 3)
    "perimeter": return room.doorCandidates (perimeter cells)
    "random": return openCells
```

---

## Integration Contract

```typescript
// Used by Module 2G (Main Pipeline) — step 8
export { placeMachines }
export { type MachinePlacementResult, type PlacedMachine, type MachineBlueprint }
export { MACHINE_BLUEPRINTS }
```

---

## Test Spec

File: `src/game/mapgen/machines_test.ts`

```
Deno.test("placeMachines is deterministic for same seed")
  - Run twice with same random → same machines

Deno.test("machines only place in qualifying rooms")
  - Provide rooms smaller than any blueprint's minimum
  - Verify no machines placed

Deno.test("machines respect maxPerMap")
  - Provide many large rooms, run placement
  - Verify no blueprint exceeds its maxPerMap count

Deno.test("required features must all be placed")
  - Blueprint with required features in a room too small
  - Verify machine is NOT placed (returns gracefully)

Deno.test("machine features are within room bounds")
  - Place machines, verify all feature positions are inside the room

Deno.test("torpedo-cache machine places a torpedo-cache item")
  - Force placement of torpedo-cache blueprint
  - Verify items array contains torpedo-cache at the correct position

Deno.test("no two machines share the same room")
  - Place multiple machines
  - Verify each room index appears at most once

Deno.test("light sources from machines have correct style")
  - Place machines with light features
  - Verify lightSources have expected style values
```
