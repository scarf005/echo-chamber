# Module 2I: Loop Punching

**Phase**: 2 (parallel with 2G, 2H, 2J)
**Depends on**: 1F (pathfinding — `distanceMap`, `bfsPath`)
**Creates**: `src/game/mapgen/loops.ts`, `src/game/mapgen/loops_test.ts`
**Depended on by**: Module 2G (called from pipeline step 6)

---

## Overview

Brogue punches loops into the dungeon to create tactical secondary routes.
After room accretion, scan for wall cells with passable cells on both sides.
If the pathfinding distance between those two passable cells is significantly
longer than their physical proximity (detour ratio), punch a doorway.

This creates shortcuts, flanking routes, and escape options — critical for
submarine combat tactics (avoiding torpedoes, flanking hostile subs).

---

## Types

```typescript
import type { TileKind, Point } from "../tiles.ts"

export interface LoopCandidate {
  readonly wallCell: Point       // the wall cell to punch through
  readonly sideA: Point          // passable cell on one side
  readonly sideB: Point          // passable cell on the other side
  readonly pathDistance: number   // BFS distance from sideA to sideB through existing passages
  readonly directDistance: number // chebyshev distance between sideA and sideB
  readonly detourRatio: number   // pathDistance / directDistance
}

export interface LoopPunchResult {
  readonly tiles: TileKind[]
  readonly punchedLoops: LoopCandidate[]  // which walls were removed
  readonly loopCount: number
}

export interface LoopPunchConfig {
  readonly minDetourRatio: number    // minimum detour ratio to punch (default: 4.0)
  readonly minPathDistance: number    // minimum path distance to consider (default: 20)
  readonly maxLoops: number          // maximum loops to punch per pass (default: 8)
  readonly passes: number            // number of passes with decreasing threshold (default: 2)
  readonly detourDecayPerPass: number // subtract from minDetourRatio each pass (default: 1.0)
  readonly punchTile: TileKind       // what the punched wall becomes (default: "water")
}
```

---

## Default Configuration

```typescript
export const DEFAULT_LOOP_CONFIG: LoopPunchConfig = {
  minDetourRatio: 4.0,
  minPathDistance: 20,
  maxLoops: 8,
  passes: 2,
  detourDecayPerPass: 1.0,
  punchTile: "water",
}
```

---

## Core Algorithm

```typescript
/**
 * Punch loops into the map to create secondary routes.
 * Multiple passes with decreasing threshold.
 */
export function punchLoops(
  tiles: TileKind[],
  width: number,
  height: number,
  config?: Partial<LoopPunchConfig>,
  random?: () => number,
): LoopPunchResult

Algorithm:
  cfg = { ...DEFAULT_LOOP_CONFIG, ...config }
  allPunched: LoopCandidate[] = []

  For pass in 0..cfg.passes - 1:
    threshold = cfg.minDetourRatio - (pass * cfg.detourDecayPerPass)
    if threshold < 2.0: break  // don't punch trivial loops

    candidates = findLoopCandidates(tiles, width, height, threshold, cfg.minPathDistance)

    // Sort by detour ratio (highest first — biggest shortcuts)
    candidates.sort((a, b) => b.detourRatio - a.detourRatio)

    // Optionally shuffle top candidates for variety
    if random: shuffleTopN(candidates, Math.min(candidates.length, cfg.maxLoops * 2), random)

    punched = 0
    For each candidate in candidates:
      if punched >= cfg.maxLoops: break

      // Verify the wall cell is still a wall (previous punches may have changed things)
      wallIndex = candidate.wallCell.y * width + candidate.wallCell.x
      if isPassableTile(tiles[wallIndex]): continue

      // Punch the wall
      tiles[wallIndex] = cfg.punchTile
      allPunched.push(candidate)
      punched += 1

  Return { tiles, punchedLoops: allPunched, loopCount: allPunched.length }
```

### Finding Loop Candidates

```typescript
function findLoopCandidates(
  tiles: TileKind[],
  width: number,
  height: number,
  minDetourRatio: number,
  minPathDistance: number,
): LoopCandidate[]

Algorithm:
  candidates: LoopCandidate[] = []

  For each interior cell (x, y) where tiles[index] is solid (wall/coral/bedrock):
    if tiles[index] === "bedrock": continue  // never punch bedrock

    // Check horizontal adjacency: left neighbor passable AND right neighbor passable
    leftIndex = y * width + (x - 1)
    rightIndex = y * width + (x + 1)
    if isPassableTile(tiles[leftIndex]) AND isPassableTile(tiles[rightIndex]):
      sideA = { x: x-1, y }
      sideB = { x: x+1, y }
      evaluateCandidate(tiles, width, height, { x, y }, sideA, sideB, candidates, minDetourRatio, minPathDistance)

    // Check vertical adjacency: top neighbor passable AND bottom neighbor passable
    topIndex = (y - 1) * width + x
    bottomIndex = (y + 1) * width + x
    if isPassableTile(tiles[topIndex]) AND isPassableTile(tiles[bottomIndex]):
      sideA = { x, y: y-1 }
      sideB = { x, y: y+1 }
      evaluateCandidate(tiles, width, height, { x, y }, sideA, sideB, candidates, minDetourRatio, minPathDistance)

  Return candidates

function evaluateCandidate(
  tiles, width, height, wallCell, sideA, sideB,
  candidates, minDetourRatio, minPathDistance,
):
  pathResult = bfsPath(tiles, width, height, sideA, sideB)
  if not pathResult.found: return  // sides not connected at all → always punch
  // (Actually, if not connected, detour is infinite → definitely punch)

  pathDistance = pathResult.distance ?? Infinity
  if pathDistance < minPathDistance: return  // too short to bother

  directDistance = chebyshevDistance(sideA, sideB)
  if directDistance === 0: return
  detourRatio = pathDistance / directDistance

  if detourRatio >= minDetourRatio:
    candidates.push({ wallCell, sideA, sideB, pathDistance, directDistance, detourRatio })
```

---

## Special Case: Disconnected Regions

If `bfsPath` between sideA and sideB returns `found: false`, the wall is
separating two disconnected regions. These should ALWAYS be punched (infinite
detour ratio), as they improve connectivity. Add these with
`detourRatio: Infinity` and process them first.

---

## Integration Contract

```typescript
// Used by Module 2G (Main Pipeline) — step 6
export { punchLoops }
export { type LoopPunchResult, type LoopCandidate, type LoopPunchConfig }
export { DEFAULT_LOOP_CONFIG }
```

---

## Test Spec

File: `src/game/mapgen/loops_test.ts`

```
Deno.test("punchLoops creates shortcuts where detour is high")
  - Construct a map with a known long detour (U-shaped corridor)
  - Run punchLoops → verify a loop was punched
  - Verify new path distance is shorter than original

Deno.test("punchLoops does not punch through bedrock")
  - Map with bedrock wall between two passable areas
  - Run punchLoops → verify bedrock cell unchanged

Deno.test("punchLoops respects maxLoops per pass")
  - Map with many candidates → verify at most maxLoops are punched per pass

Deno.test("punchLoops multiple passes punch more loops")
  - passes=1 vs passes=3 → more loops punched with more passes

Deno.test("findLoopCandidates identifies horizontal and vertical candidates")
  - Known grid with both horizontal and vertical pinch points
  - Verify both are found

Deno.test("punchLoops is deterministic for same seed")
  - Run twice with same random → same result

Deno.test("punching a loop maintains border integrity")
  - After punchLoops, verify no border cell was modified

Deno.test("disconnected regions are connected by punching")
  - Create map with isolated pocket separated by 1-cell wall
  - Run punchLoops → verify the regions are now connected
```
