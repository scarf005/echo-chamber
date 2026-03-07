# Module 1B: CA Blob Generator

**Phase**: 1 (parallel — no dependencies on other Phase 1 modules)
**Depends on**: Phase 0 (`TileKind`)
**Creates**: `src/game/mapgen/blob.ts`, `src/game/mapgen/blob_test.ts`
**Depended on by**: Module 1A (cavern room shape), Module 2G (pipeline), Module 2H (lakes)

---

## Overview

A reusable cellular automata blob generator, independent of rot-js. Used for:
- Cavern-shaped rooms (Module 1A)
- Lake/open chamber shapes (Module 2H)
- Organic terrain patches (feature autogenerator, Module 1D)

Brogue uses CA blobs extensively: 55% initial alive probability, B5678/S45678
rule, 5 iterations. This module provides a generic, configurable version.

---

## Types

```typescript
export interface BlobParams {
  readonly aliveProbability: number     // 0.0–1.0, initial fill chance
  readonly birthRule: readonly number[] // neighbor counts that birth a cell (e.g. [5,6,7,8])
  readonly survivalRule: readonly number[] // neighbor counts that keep a cell alive
  readonly iterations: number           // number of CA smoothing passes
  readonly topology: 4 | 8             // 4-connected or 8-connected neighbors
}

/** A generated blob: a rectangular grid of booleans */
export interface Blob {
  readonly width: number
  readonly height: number
  readonly cells: boolean[]   // flat array indexed as y * width + x
  readonly area: number       // count of true cells
}

/** Preset configurations */
export const BLOB_PRESETS = {
  /** Brogue-standard blob: organic, medium density */
  standard: {
    aliveProbability: 0.55,
    birthRule: [5, 6, 7, 8],
    survivalRule: [4, 5, 6, 7, 8],
    iterations: 5,
    topology: 8,
  },
  /** Dense blob: more solid, fewer holes */
  dense: {
    aliveProbability: 0.62,
    birthRule: [4, 5, 6, 7, 8],
    survivalRule: [3, 4, 5, 6, 7, 8],
    iterations: 4,
    topology: 8,
  },
  /** Sparse blob: wispy, tendril-like */
  sparse: {
    aliveProbability: 0.45,
    birthRule: [6, 7, 8],
    survivalRule: [5, 6, 7, 8],
    iterations: 3,
    topology: 8,
  },
  /** Tight tunnels: narrow winding passages */
  tunnels: {
    aliveProbability: 0.48,
    birthRule: [5, 6, 7, 8],
    survivalRule: [4, 5, 6, 7, 8],
    iterations: 6,
    topology: 4,
  },
} as const satisfies Record<string, BlobParams>
```

---

## Core Algorithm

```typescript
/**
 * Generate a CA blob on a width x height grid.
 *
 * Returns the largest connected component (8-connected BFS),
 * so the result is always a single contiguous region.
 */
export function generateBlob(
  width: number,
  height: number,
  params: BlobParams,
  random: () => number,
): Blob

Algorithm:
  1. Initialize grid[width * height]:
     For each cell: grid[i] = random() < params.aliveProbability

  2. For each iteration in 0..params.iterations:
     a. Create nextGrid = copy of grid
     b. For each cell (x, y) not on the border:
        - Count alive neighbors (using params.topology)
        - If cell is alive AND neighborCount in params.survivalRule: stay alive
        - If cell is dead AND neighborCount in params.birthRule: become alive
        - Otherwise: dead
     c. grid = nextGrid

  3. Find connected components (8-connected BFS):
     a. For each unvisited alive cell, flood-fill to find component
     b. Track the largest component by cell count

  4. Create result from largest component only:
     - cells[i] = true only if cell is alive AND in the largest component

  5. Return { width, height, cells, area: count of true cells }
```

### Neighbor Counting

```typescript
function countAliveNeighbors(
  grid: boolean[],
  width: number,
  height: number,
  x: number,
  y: number,
  topology: 4 | 8,
): number

  const offsets_4 = [[-1,0],[1,0],[0,-1],[0,1]]
  const offsets_8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
  const offsets = topology === 4 ? offsets_4 : offsets_8

  count = 0
  for each [dx, dy] in offsets:
    nx = x + dx, ny = y + dy
    if out of bounds: count += 1  // border counts as alive (Brogue convention)
    else if grid[ny * width + nx]: count += 1
  return count
```

### Largest Connected Component

```typescript
function largestComponent(
  grid: boolean[],
  width: number,
  height: number,
): Set<number>

  Use 8-connected BFS. Track all components. Return the Set<index>
  of the one with the most members.
```

---

## Utility: Blob Operations

```typescript
/** Shrink-wrap a blob to its bounding box, removing empty border rows/cols */
export function trimBlob(blob: Blob): Blob

/** Stamp a blob onto a tile grid at position (ox, oy), converting true cells to targetTile */
export function stampBlob(
  tiles: TileKind[],
  mapWidth: number,
  mapHeight: number,
  blob: Blob,
  ox: number,
  oy: number,
  targetTile: TileKind,
): void

/** Check if stamping a blob at (ox, oy) would overlap any non-wall tiles */
export function blobOverlapsOpen(
  tiles: TileKind[],
  mapWidth: number,
  blob: Blob,
  ox: number,
  oy: number,
): boolean

/** Get the perimeter cells of a blob (cells adjacent to a false cell or border) */
export function blobPerimeter(blob: Blob): Point[]
```

---

## Integration Contract

```typescript
// Used by Module 1A (cavern room generator)
export { generateBlob, type Blob, type BlobParams, BLOB_PRESETS }

// Used by Module 2H (lake placement)
export { generateBlob, stampBlob, blobOverlapsOpen, trimBlob, blobPerimeter }
export { BLOB_PRESETS }
```

---

## Test Spec

File: `src/game/mapgen/blob_test.ts`

```
Deno.test("generateBlob is deterministic for same seed")
  - Run twice with identical random function
  - assertEquals on cells arrays

Deno.test("generateBlob produces single connected component")
  - Generate blob 20x15 with standard preset
  - BFS from any true cell — verify it reaches ALL true cells

Deno.test("generateBlob area is within reasonable range")
  - Generate 20x15 standard blob
  - Verify area > 0.2 * 20 * 15 and area < 0.8 * 20 * 15

Deno.test("generateBlob with dense preset has higher fill ratio than sparse")
  - Generate both on same size grid
  - Verify dense.area > sparse.area (statistically, run with fixed seed)

Deno.test("trimBlob removes empty border")
  - Create blob with known empty rows/cols on edges
  - Verify trimmed dimensions are smaller
  - Verify trimmed cells still form the same shape

Deno.test("stampBlob writes correct tiles at offset")
  - Create small blob, stamp onto a wall-filled grid at offset (5, 3)
  - Verify the stamped region matches expected tile type
  - Verify non-blob cells remain "wall"

Deno.test("blobOverlapsOpen detects overlap with non-wall")
  - Grid with some water cells, blob that overlaps them → true
  - Grid with all walls at blob position → false

Deno.test("blobPerimeter returns edge cells only")
  - Generate small blob
  - Verify every perimeter cell has at least one neighbor that is false or out of bounds
  - Verify no interior cell is in the perimeter set

Deno.test("border cells count as alive for neighbor counting (Brogue convention)")
  - Cell at (0,0) corner: all out-of-bounds neighbors count as alive
  - Verify neighbor count is correct
```
