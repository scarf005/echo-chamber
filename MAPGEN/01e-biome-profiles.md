# Module 1E: Biome Profile System

**Phase**: 1 (parallel — no dependencies on other Phase 1 modules)
**Depends on**: Phase 0 (`TileKind`, `BiomeKind`)
**Creates**: `src/game/mapgen/biomes.ts`, `src/game/mapgen/biomes_test.ts`
**Depended on by**: Module 1A (room frequency), Module 2G (pipeline), Module 1C (color shifts)

---

## Overview

The existing `BiomeKind` type is defined but unused. This module activates it:
each biome defines a parameter profile that controls room frequency weights,
CA parameters, feature density, color shifts, and terrain distribution.

The map is divided into zones (Voronoi or rectangular strips), each assigned a
biome. The generation pipeline queries the biome profile to adjust its behavior
per-region.

---

## Types

```typescript
import type { BiomeKind, TileKind } from "../tiles.ts"
import type { BlobParams } from "./blob.ts"
import type { BiomeColorShift } from "./color.ts"

export interface BiomeProfile {
  readonly kind: BiomeKind
  readonly displayName: string

  // Room generation modifiers
  readonly roomFrequencyModifiers: Record<string, number>
  // Keyed by RoomShape. Multiplier on base frequency. 1.0 = default, 0 = never, 2.0 = double.

  readonly targetRoomCount: number    // how many rooms to try placing in this zone

  // CA parameters for initial cellular automata (if used instead of room accretion)
  readonly caParams: {
    readonly wallProbability: number
    readonly smoothingIterations: number
    readonly topology: 4 | 8
  }

  // Feature autogenerator modifiers
  readonly featureFrequencyModifiers: Record<string, number>
  // Keyed by feature ID. Multiplier on base frequency.

  // Terrain distribution targets (soft guidance, not hard constraints)
  readonly terrainHints: Partial<Record<TileKind, number>>
  // Relative weights for terrain types. Higher = more of this terrain.
  // e.g. { water: 0.6, sand: 0.2, kelp: 0.15, vent: 0.05 }

  // Color atmosphere
  readonly colorShift: BiomeColorShift

  // Blob params for lakes/chambers in this biome
  readonly lakeBlobParams: BlobParams
  readonly maxLakes: number
}

/** A region of the map assigned to a specific biome */
export interface BiomeZone {
  readonly kind: BiomeKind
  readonly profile: BiomeProfile
  readonly bounds: { x: number; y: number; width: number; height: number }
  readonly mask: boolean[]  // parallel array to map tiles, true = this zone
}
```

---

## Biome Catalog

```typescript
export const BIOME_PROFILES: Record<BiomeKind, BiomeProfile> = {
  regular: {
    kind: "regular",
    displayName: "Open Caverns",
    roomFrequencyModifiers: {},  // all defaults
    targetRoomCount: 10,
    caParams: { wallProbability: 0.45, smoothingIterations: 4, topology: 8 },
    featureFrequencyModifiers: {},
    terrainHints: { water: 0.6, wall: 0.35, sand: 0.05 },
    colorShift: { tempR: 0, tempG: 0, tempB: 0 },
    lakeBlobParams: BLOB_PRESETS.standard,  // from Module 1B
    maxLakes: 3,
  },
  vast: {
    kind: "vast",
    displayName: "Abyssal Expanse",
    roomFrequencyModifiers: { chamber: 2.0, cavern: 1.8, tunnel: 0.5, grotto: 0.3 },
    targetRoomCount: 6,
    caParams: { wallProbability: 0.35, smoothingIterations: 5, topology: 8 },
    featureFrequencyModifiers: { "kelp-patch": 1.5, "sand-patch": 2.0, "thermal-vent": 0.3 },
    terrainHints: { water: 0.75, wall: 0.1, sand: 0.1, abyss: 0.05 },
    colorShift: { tempR: -10, tempG: -5, tempB: 15 },
    lakeBlobParams: BLOB_PRESETS.dense,
    maxLakes: 5,
  },
  tight: {
    kind: "tight",
    displayName: "Narrow Fissures",
    roomFrequencyModifiers: { tunnel: 2.5, grotto: 1.5, chamber: 0.3, cavern: 0.2 },
    targetRoomCount: 15,
    caParams: { wallProbability: 0.58, smoothingIterations: 3, topology: 4 },
    featureFrequencyModifiers: { "coral-cluster": 1.8, "mineral-deposit": 1.5, "kelp-patch": 0.3 },
    terrainHints: { water: 0.35, wall: 0.55, coral: 0.08, sand: 0.02 },
    colorShift: { tempR: 5, tempG: -5, tempB: -10 },
    lakeBlobParams: BLOB_PRESETS.sparse,
    maxLakes: 1,
  },
  chaotic: {
    kind: "chaotic",
    displayName: "Shattered Reef",
    roomFrequencyModifiers: { pocket: 2.0, fissure: 1.8, grotto: 1.5, cavern: 0.5 },
    targetRoomCount: 12,
    caParams: { wallProbability: 0.50, smoothingIterations: 2, topology: 8 },
    featureFrequencyModifiers: { "coral-cluster": 2.5, "bioluminescence": 1.5, "thermal-vent": 1.5 },
    terrainHints: { water: 0.45, wall: 0.25, coral: 0.15, kelp: 0.1, vent: 0.05 },
    colorShift: { tempR: 15, tempG: 5, tempB: -5 },
    lakeBlobParams: BLOB_PRESETS.standard,
    maxLakes: 2,
  },
  wavy: {
    kind: "wavy",
    displayName: "Current Channels",
    roomFrequencyModifiers: { tunnel: 2.0, chamber: 1.2, grotto: 0.5 },
    targetRoomCount: 8,
    caParams: { wallProbability: 0.42, smoothingIterations: 5, topology: 8 },
    featureFrequencyModifiers: { "sea-grass": 2.0, "sand-patch": 1.5, "kelp-patch": 1.5 },
    terrainHints: { water: 0.5, current: 0.15, sand: 0.15, shallows: 0.1, wall: 0.1 },
    colorShift: { tempR: -5, tempG: 10, tempB: 10 },
    lakeBlobParams: BLOB_PRESETS.dense,
    maxLakes: 4,
  },
}
```

---

## Zone Assignment Algorithm

```typescript
/**
 * Divide the map into biome zones.
 * Uses vertical strip division (simpler than Voronoi, fits side-view perspective).
 *
 * The map is split into N vertical strips (N = biomes.length).
 * Each strip is assigned one of the requested biomes.
 * Strip boundaries are slightly randomized for organic feel.
 */
export function assignBiomeZones(
  width: number,
  height: number,
  biomes: BiomeKind[],
  random: () => number,
): BiomeZone[]

Algorithm:
  1. If biomes is empty, return single zone covering entire map with "regular" profile
  2. N = biomes.length
  3. Base strip width = floor(width / N)
  4. Generate N boundary positions:
     boundaries = [0]
     For i in 1..N-1:
       base = i * baseStripWidth
       jitter = floor((random() - 0.5) * baseStripWidth * 0.3)
       boundaries.push(clamp(base + jitter, boundaries[i-1] + 4, width - 4))
     boundaries.push(width)
  5. For each strip i in 0..N-1:
     Create BiomeZone:
       kind = biomes[i]
       profile = BIOME_PROFILES[biomes[i]]
       bounds = { x: boundaries[i], y: 0, width: boundaries[i+1] - boundaries[i], height }
       mask = boolean array where mask[y*width+x] = true if boundaries[i] <= x < boundaries[i+1]
  6. Return zones

/**
 * Select biomes for a map based on seed.
 * Returns 2-4 biomes, always including "regular" as the starting zone.
 */
export function selectBiomes(
  random: () => number,
): BiomeKind[]

Algorithm:
  count = randomInteger(random, 2, 4)
  result = ["regular"]  // first zone is always regular (player start area)
  pool = ["vast", "tight", "chaotic", "wavy"]
  shuffle(pool, random)
  result.push(...pool.slice(0, count - 1))
  return result
```

---

## Integration Contract

```typescript
// Used by Module 1A (Room Shapes) — room frequency modifiers
export { type BiomeProfile, BIOME_PROFILES }

// Used by Module 2G (Main Pipeline) — zone assignment and biome selection
export { assignBiomeZones, selectBiomes }
export { type BiomeZone }

// Used by Module 1C (Color) — biome color shifts
export { type BiomeProfile, BIOME_PROFILES }

// Used by Module 2H (Lakes) — lake blob params per biome
export { type BiomeProfile, BIOME_PROFILES }
```

---

## Test Spec

File: `src/game/mapgen/biomes_test.ts`

```
Deno.test("assignBiomeZones covers entire map width")
  - Generate zones for a 100x50 map with 3 biomes
  - Verify union of all zone masks covers every cell exactly once

Deno.test("assignBiomeZones is deterministic for same seed")
  - Run twice → assertEquals on zone bounds

Deno.test("assignBiomeZones with single biome covers entire map")
  - Single biome → verify mask is all true

Deno.test("selectBiomes always starts with regular")
  - Run 10 times with different seeds
  - Verify first element is always "regular"

Deno.test("selectBiomes returns 2-4 biomes")
  - Run 20 times, verify length is 2, 3, or 4

Deno.test("BIOME_PROFILES has entry for every BiomeKind")
  - Verify all 5 BiomeKind values have profiles

Deno.test("zone boundaries have minimum width of 4")
  - Generate zones for narrow map
  - Verify each zone width >= 4

Deno.test("roomFrequencyModifiers are non-negative")
  - For each profile, verify all modifier values >= 0
```
