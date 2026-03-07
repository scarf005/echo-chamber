# Module 1A: Room Shapes & Placement

**Phase**: 1 (parallel — no dependencies on other Phase 1 modules)
**Depends on**: Phase 0 (`TileKind`, `TILE_PROPERTIES`)
**Creates**: `src/game/mapgen/rooms.ts`, `src/game/mapgen/rooms_test.ts`
**Depended on by**: Module 2G (Main Pipeline), Module 2J (Machines)

---

## Overview

Port Brogue's room accretion system adapted for underwater caverns. Instead of
rectangular dungeon rooms, Echo Chamber uses organic cavern shapes: grottos,
tunnels, fissures, and open chambers. The room system generates shapes on a
"hyperspace" scratch grid, then attempts to place them on the actual map by
sliding them until they fit snugly against existing terrain.

---

## Types

```typescript
export type RoomShape =
  | "grotto"          // small rectangle with rounded corners (Brogue: small rectangle)
  | "tunnel"          // long narrow passage (Brogue: corridor)
  | "cavern"          // CA-generated organic blob (Brogue: large cavern)
  | "fissure"         // cross or T-shaped crack (Brogue: cross room)
  | "chamber"         // circular/oval open space (Brogue: circle room)
  | "pocket"          // overlapping circles, chunky (Brogue: chunky room)

export interface RoomTemplate {
  readonly shape: RoomShape
  readonly minWidth: number
  readonly maxWidth: number
  readonly minHeight: number
  readonly maxHeight: number
  readonly frequency: number        // relative spawn weight (higher = more common)
  readonly generator: (width: number, height: number, random: () => number) => boolean[]
  // generator returns a flat boolean array (true = carved open, false = wall)
  // indexed as y * width + x
}

export interface PlacedRoom {
  readonly originX: number         // top-left corner on the map grid
  readonly originY: number
  readonly width: number
  readonly height: number
  readonly shape: RoomShape
  readonly cells: boolean[]        // which cells are carved (relative to origin)
  readonly doorCandidates: Point[] // cells on the room perimeter adjacent to existing walls
}

export interface AccretionResult {
  readonly tiles: TileKind[]       // the tile grid after all rooms placed
  readonly rooms: PlacedRoom[]     // list of placed rooms (for machine placement later)
  readonly doorways: Point[]       // connection points between rooms
}
```

---

## Room Template Catalog

```typescript
export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    shape: "grotto",
    minWidth: 4, maxWidth: 8,
    minHeight: 3, maxHeight: 6,
    frequency: 30,
    generator: generateGrotto,
  },
  {
    shape: "tunnel",
    minWidth: 8, maxWidth: 20,
    minHeight: 2, maxHeight: 3,
    frequency: 25,
    generator: generateTunnel,
  },
  {
    shape: "cavern",
    minWidth: 10, maxWidth: 25,
    minHeight: 8, maxHeight: 15,
    frequency: 15,
    generator: generateCavern,  // uses CA blob from Module 1B
  },
  {
    shape: "fissure",
    minWidth: 6, maxWidth: 12,
    minHeight: 6, maxHeight: 12,
    frequency: 12,
    generator: generateFissure,
  },
  {
    shape: "chamber",
    minWidth: 5, maxWidth: 12,
    minHeight: 5, maxHeight: 12,
    frequency: 10,
    generator: generateChamber,
  },
  {
    shape: "pocket",
    minWidth: 6, maxWidth: 14,
    minHeight: 5, maxHeight: 10,
    frequency: 8,
    generator: generatePocket,
  },
]
```

---

## Algorithms

### Room Generation (per-shape)

**generateGrotto(w, h, random)**: Fill a w*h grid with `true`. Optionally knock out corners with radius-1 circles to round them.

**generateTunnel(w, h, random)**: Fill center rows (y = floor(h/2) +/- 0..1) with `true`. Optionally add slight vertical wobble using random walk.

**generateCavern(w, h, random)**: Use the CA blob generator (Module 1B) — `generateBlob(w, h, { aliveProbability: 0.55, birthRule: [5,6,7,8], survivalRule: [4,5,6,7,8], iterations: 5 }, random)`. Return the blob mask.

**generateFissure(w, h, random)**: Create a cross shape — horizontal bar at y=h/2 width=w height=2, vertical bar at x=w/2 width=2 height=h. Optionally add a third arm (T-shape) with 40% chance.

**generateChamber(w, h, random)**: Carve an ellipse centered at (w/2, h/2) with radii (w/2-1, h/2-1). For each cell, include if `((x-cx)/rx)^2 + ((y-cy)/ry)^2 <= 1`.

**generatePocket(w, h, random)**: Place 2-4 overlapping circles with random centers within the bounds and radii between 2 and min(w,h)/3.

### Room Accretion (Brogue-style)

```
function accreteRooms(
  width: number,
  height: number,
  targetRoomCount: number,
  random: () => number,
  biomeProfile: BiomeProfile,       // from Module 1E
): AccretionResult

Algorithm:
  1. Initialize tiles[width*height] = all "wall"
  2. Generate first room (always "grotto" or "chamber"), place at center
     - Mark carved cells as "water"
  3. Loop until roomCount >= targetRoomCount or 200 failed attempts:
     a. Select room template by weighted random from ROOM_TEMPLATES
        (biome profile modifies frequencies)
     b. Generate room shape: template.generator(randomSize, random)
     c. Try to place room via hyperspace sliding:
        - For each candidate position (shuffled):
          i.  Check the room does NOT overlap any existing "water" cells
              (allow 1-cell overlap for doorway)
          ii. Check the room IS adjacent to at least one existing "water" cell
              (at least 1 cell of the room perimeter touches carved space)
          iii. Check the room stays within interior bounds (not touching border)
        - If valid position found:
          i.  Carve room cells to "water"
          ii. Identify doorway: the 1-cell overlap point or the adjacent point
          iii. Record PlacedRoom and doorway Point
     d. If no valid position after N random attempts, shrink room and retry
  4. Return { tiles, rooms, doorways }
```

### Hyperspace Sliding Detail

```
function findPlacement(
  tiles: TileKind[],
  width: number,
  height: number,
  room: { cells: boolean[], w: number, h: number },
  random: () => number,
  maxAttempts: number,
): { x: number, y: number, door: Point } | null

Algorithm:
  For attempt in 0..maxAttempts:
    1. Pick random position: x in [1, width-room.w-1], y in [1, height-room.h-1]
    2. Count overlap = cells where room.cells[i]=true AND tiles[mapIndex]!="wall"
    3. Count adjacency = cells where room.cells[i]=true AND any neighbor is "water"
    4. If overlap <= 1 AND adjacency >= 1:
       - doorCandidate = the overlapping cell, or the adjacent-to-water cell
       - return { x, y, door: doorCandidate }
  Return null
```

---

## Integration Contract

Exports consumed by other modules:

```typescript
// Used by Module 2G (Main Pipeline)
export function accreteRooms(
  width: number, height: number,
  targetRoomCount: number,
  random: () => number,
  biomeProfile: BiomeProfile,
): AccretionResult

// Used by Module 2J (Machines) to find rooms large enough for blueprints
export function findRoomsByMinSize(
  rooms: PlacedRoom[],
  minWidth: number,
  minHeight: number,
): PlacedRoom[]

// Room template catalog (used by Module 2J for machine room requirements)
export { ROOM_TEMPLATES, type RoomTemplate, type PlacedRoom, type RoomShape }
```

---

## Test Spec

File: `src/game/mapgen/rooms_test.ts`

```
Deno.test("generateGrotto produces connected open space")
  - Generate a grotto, verify at least 60% of cells are true
  - Verify the open cells form a single connected component

Deno.test("generateTunnel produces elongated passage")
  - Generate tunnel with w=15, h=3
  - Verify there exists a horizontal path from left to right

Deno.test("generateCavern produces organic blob")
  - Generate cavern 15x10
  - Verify between 30% and 70% cells are open
  - Verify single connected component

Deno.test("accreteRooms places at least N rooms for sufficient attempts")
  - Run accreteRooms with targetRoomCount=8 on a 60x30 grid
  - Verify rooms.length >= 6 (allow some failures)
  - Verify all rooms are within bounds

Deno.test("accreteRooms produces connected map")
  - Run accreteRooms, then BFS from first room to last room
  - Verify path exists

Deno.test("accreteRooms is deterministic for same seed")
  - Run twice with same random seed
  - assertEquals on resulting tiles

Deno.test("room cells never touch the border")
  - For each PlacedRoom, verify no cell has x=0, y=0, x=width-1, y=height-1

Deno.test("findRoomsByMinSize filters correctly")
  - Create mock rooms of various sizes
  - Verify filter returns only rooms meeting minimum dimensions
```
