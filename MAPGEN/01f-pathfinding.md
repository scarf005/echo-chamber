# Module 1F: Pathfinding & Connectivity Utilities

**Phase**: 1 (parallel — no dependencies on other Phase 1 modules)
**Depends on**: Phase 0 (`TileKind`, `isPassableTile`, `TILE_PROPERTIES`)
**Creates**: `src/game/mapgen/pathfinding.ts`, `src/game/mapgen/pathfinding_test.ts`
**Depended on by**: Module 2G, 2H, 2I (pipeline, lakes, loop punching)

---

## Overview

Extract and generalize the pathfinding/connectivity code that currently lives
inline in `mapgen.ts` (`hasPath`, `computeRouteLength`). Add Dijkstra for
weighted movement costs, flood-fill for connectivity checks, and component
analysis for the loop punching and lake placement algorithms.

---

## Types

```typescript
import type { TileKind, Point } from "../tiles.ts"

/** Result of a pathfinding query */
export interface PathResult {
  readonly found: boolean
  readonly distance: number | null   // null if no path
  readonly path: Point[] | null      // null if no path; sequence of points from start to end
}

/** Result of flood-fill / connectivity analysis */
export interface ConnectedComponent {
  readonly cells: Set<number>        // set of flat indices
  readonly size: number
}

/** Options for pathfinding */
export interface PathOptions {
  readonly weighted: boolean         // if true, use TILE_PROPERTIES.movementCost
  readonly topology: 4 | 8          // 4-directional or 8-directional
  readonly passabilityCheck?: (tile: TileKind | null) => boolean
  // custom passability (defaults to isPassableTile)
}
```

---

## Core Functions

### BFS (unweighted, for simple reachability)

```typescript
/**
 * BFS from start to end on a tile grid.
 * Replaces the current inline hasPath/computeRouteLength in mapgen.ts.
 */
export function bfsPath(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  end: Point,
  options?: Partial<PathOptions>,
): PathResult

Algorithm:
  passable = options.passabilityCheck ?? isPassableTile
  topology = options.topology ?? 4
  directions = topology === 4
    ? [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
    : [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}]

  queue = [{ point: start, distance: 0, prev: null }]
  seen = Set<number>
  cameFrom = Map<number, number>  // index → parent index (for path reconstruction)

  while queue not empty:
    current = queue.shift()
    index = current.point.y * width + current.point.x
    if seen.has(index): continue
    seen.add(index)
    cameFrom.set(index, previousIndex)

    if current.point equals end:
      return { found: true, distance: current.distance, path: reconstructPath(cameFrom, start, end, width) }

    for each direction:
      next = { x: current.point.x + dir.x, y: current.point.y + dir.y }
      if out of bounds: continue
      nextIndex = next.y * width + next.x
      if seen.has(nextIndex): continue
      if not passable(tiles[nextIndex]): continue
      queue.push({ point: next, distance: current.distance + 1, prev: index })

  return { found: false, distance: null, path: null }
```

### Dijkstra (weighted, for movement cost)

```typescript
/**
 * Dijkstra from start to end, using TILE_PROPERTIES.movementCost as edge weights.
 * Used for actual movement cost calculations and AI pathfinding.
 */
export function dijkstraPath(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  end: Point,
  options?: Partial<PathOptions>,
): PathResult

Algorithm:
  Same as BFS but with a priority queue (min-heap by distance).
  Edge weight = TILE_PROPERTIES[targetTile].movementCost
  If movementCost === 0 (impassable), skip.
```

### Flood Fill (single component)

```typescript
/**
 * Flood-fill from a starting point, collecting all connected passable cells.
 */
export function floodFill(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  options?: Partial<PathOptions>,
): ConnectedComponent

Algorithm:
  BFS from start, collecting all reachable cells.
  Return { cells: Set of indices, size: cells.size }
```

### All Connected Components

```typescript
/**
 * Find ALL connected components of passable tiles on the map.
 * Returns sorted by size (largest first).
 */
export function findAllComponents(
  tiles: TileKind[],
  width: number,
  height: number,
  options?: Partial<PathOptions>,
): ConnectedComponent[]

Algorithm:
  visited = Set<number>
  components = []
  For each cell (x, y):
    index = y * width + x
    if visited.has(index): continue
    if not passable(tiles[index]): continue
    component = floodFill(tiles, width, height, {x, y}, options)
    for each cell in component: visited.add(cell)
    components.push(component)
  Sort components by size descending
  Return components
```

### Connectivity Check

```typescript
/**
 * Check if adding/removing tiles at given positions disconnects the map.
 * Used by lake placement (Module 2H) to ensure lakes don't break connectivity.
 */
export function wouldDisconnect(
  tiles: TileKind[],
  width: number,
  height: number,
  changedCells: { index: number; newTile: TileKind }[],
  requiredConnections: [Point, Point][],
): boolean

Algorithm:
  1. Create temporary copy of tiles
  2. Apply changedCells
  3. For each [a, b] in requiredConnections:
     If not bfsPath(tempTiles, width, height, a, b).found:
       return true  // disconnected
  4. return false
```

### Distance Map (Dijkstra map)

```typescript
/**
 * Compute distance from a source point to ALL reachable cells.
 * Returns a flat array of distances (Infinity for unreachable).
 * Used by loop punching to find cells with long path detours.
 */
export function distanceMap(
  tiles: TileKind[],
  width: number,
  height: number,
  source: Point,
  options?: Partial<PathOptions>,
): number[]

Algorithm:
  Initialize distances[width * height] = Infinity
  BFS/Dijkstra from source, recording distance for each visited cell.
  Return distances.
```

---

## Migration from Current Code

The following functions in `mapgen.ts` are REPLACED by this module:

| Current (mapgen.ts) | Replacement (pathfinding.ts) |
|---------------------|------------------------------|
| `hasPath(tiles, w, h, start, end)` | `bfsPath(tiles, w, h, start, end).found` |
| `computeRouteLength(tiles, w, h, start, end)` | `bfsPath(tiles, w, h, start, end).distance` |

After Phase 4 integration, the old functions in `mapgen.ts` should be removed
and all callers updated to use the new pathfinding module.

---

## Integration Contract

```typescript
// Used by Module 2G (Main Pipeline) — connectivity verification
export { bfsPath, floodFill, findAllComponents, wouldDisconnect }

// Used by Module 2H (Lakes) — ensure lakes don't disconnect
export { wouldDisconnect, floodFill }

// Used by Module 2I (Loop Punching) — distance maps for detour detection
export { distanceMap, bfsPath }

// Used by Module 1A (Room Accretion) — verify room connectivity
export { bfsPath, floodFill }

// Types
export { type PathResult, type ConnectedComponent, type PathOptions }
```

---

## Test Spec

File: `src/game/mapgen/pathfinding_test.ts`

```
Deno.test("bfsPath finds path in open grid")
  - Create grid of all water
  - Verify path from (1,1) to (10,5) is found with correct distance

Deno.test("bfsPath returns null when no path exists")
  - Create grid with wall barrier splitting it in two
  - Verify found=false and distance=null

Deno.test("bfsPath respects topology setting")
  - Grid where diagonal path exists but cardinal does not
  - topology=4 → no path; topology=8 → path found

Deno.test("dijkstraPath accounts for movement costs")
  - Grid with sand tiles (cost 1.5) forming a shorter geometric path
  - And water tiles (cost 1.0) forming a longer geometric path
  - Verify dijkstra prefers the lower-cost route

Deno.test("floodFill collects all reachable cells")
  - Known grid with one connected open region of size 20
  - Verify component.size === 20

Deno.test("findAllComponents finds multiple islands")
  - Grid with 3 disconnected water regions
  - Verify 3 components returned, sorted by size

Deno.test("wouldDisconnect returns true when change breaks connectivity")
  - Grid with a narrow 1-cell bridge
  - Change bridge cell to wall
  - Verify wouldDisconnect returns true for endpoints

Deno.test("wouldDisconnect returns false for safe changes")
  - Remove a cell from a wide corridor
  - Verify connectivity maintained

Deno.test("distanceMap produces correct distances")
  - Small known grid
  - Verify distances match hand-calculated values

Deno.test("distanceMap marks unreachable cells as Infinity")
  - Grid with disconnected region
  - Verify those cells have Infinity distance

Deno.test("bfsPath matches old computeRouteLength for backward compatibility")
  - Generate a map with old generateMap()
  - Compare old computeRouteLength result with bfsPath().distance
  - Must be equal
```

---

## Priority Queue Implementation Note

For Dijkstra, implement a simple binary min-heap or use a sorted insertion
approach. The maps are small enough (144*84 = 12,096 cells) that a naive
approach works fine. Do NOT add external dependencies.

```typescript
/** Simple min-heap for Dijkstra */
class MinHeap<T> {
  private items: Array<{ value: T; priority: number }> = []

  push(value: T, priority: number): void { /* standard heap insert */ }
  pop(): T | undefined { /* standard heap extract-min */ }
  get size(): number { return this.items.length }
}
```
