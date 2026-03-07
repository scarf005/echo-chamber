# Module 1D: Feature Autogenerator Engine

**Phase**: 1 (parallel — no dependencies on other Phase 1 modules)
**Depends on**: Phase 0 (`TileKind`, `TILE_PROPERTIES`)
**Creates**: `src/game/mapgen/autogen.ts`, `src/game/mapgen/autogen_test.ts`
**Depended on by**: Module 2G (pipeline), Module 2J (machines)

---

## Overview

Brogue's autogenerator system spawns environmental features (fungi, torches,
foliage, gas vents, etc.) using a catalog of feature definitions. Each feature
specifies where it can appear, how likely it is, and how it propagates to
neighboring cells.

In Echo Chamber: kelp patches, coral clusters, bioluminescent organisms,
barnacle colonies, mineral deposits, thermal vent clusters, sea grass meadows.

---

## Types

```typescript
export interface FeatureDefinition {
  readonly id: string
  readonly displayName: string
  readonly targetTile: TileKind        // what tile this feature replaces or decorates
  readonly requiredTerrain: TileKind[] // which terrain types this can appear on
  readonly frequency: number           // 0.0–1.0, chance per eligible cell to seed
  readonly maxCount: number            // max instances across the entire map
  readonly propagationChance: number   // 0.0–1.0, chance to spread to each neighbor
  readonly propagationDecay: number    // multiplied into propagationChance each step
  readonly maxPropagationDepth: number // max recursion depth for spreading
  readonly minDistanceFromSpawn: number // don't place too close to player start
  readonly minDistanceFromCapsule: number
  readonly clusterSize: { min: number; max: number }  // size range for each cluster
  readonly placesLight?: LightSource   // optional light source at placement (Module 1C)
}

export interface PlacedFeature {
  readonly id: string          // matches FeatureDefinition.id
  readonly position: Point
  readonly fromPropagation: boolean
}

export interface AutogenResult {
  readonly tiles: TileKind[]           // modified tile array
  readonly features: PlacedFeature[]   // all placed features for metadata
  readonly lightSources: LightSource[] // lights spawned by features
}
```

---

## Feature Catalog

```typescript
export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  {
    id: "kelp-patch",
    displayName: "Kelp Forest",
    targetTile: "kelp",
    requiredTerrain: ["water"],
    frequency: 0.008,
    maxCount: 40,
    propagationChance: 0.65,
    propagationDecay: 0.85,
    maxPropagationDepth: 6,
    minDistanceFromSpawn: 4,
    minDistanceFromCapsule: 3,
    clusterSize: { min: 3, max: 12 },
  },
  {
    id: "coral-cluster",
    displayName: "Coral Formation",
    targetTile: "coral",
    requiredTerrain: ["wall"],
    frequency: 0.005,
    maxCount: 25,
    propagationChance: 0.5,
    propagationDecay: 0.8,
    maxPropagationDepth: 4,
    minDistanceFromSpawn: 5,
    minDistanceFromCapsule: 4,
    clusterSize: { min: 2, max: 8 },
  },
  {
    id: "bioluminescence",
    displayName: "Bioluminescent Colony",
    targetTile: "water",   // doesn't change terrain, just adds light
    requiredTerrain: ["water", "kelp"],
    frequency: 0.003,
    maxCount: 12,
    propagationChance: 0.3,
    propagationDecay: 0.7,
    maxPropagationDepth: 3,
    minDistanceFromSpawn: 6,
    minDistanceFromCapsule: 4,
    clusterSize: { min: 1, max: 4 },
    placesLight: {
      position: { x: 0, y: 0 },  // filled at placement time
      radius: 5,
      color: { r: 0.2, g: 0.8, b: 0.9 },
      fadePercent: 0.7,
      style: "bioluminescent",
    },
  },
  {
    id: "thermal-vent",
    displayName: "Thermal Vent",
    targetTile: "vent",
    requiredTerrain: ["water"],
    frequency: 0.002,
    maxCount: 8,
    propagationChance: 0.25,
    propagationDecay: 0.5,
    maxPropagationDepth: 2,
    minDistanceFromSpawn: 8,
    minDistanceFromCapsule: 6,
    clusterSize: { min: 1, max: 3 },
    placesLight: {
      position: { x: 0, y: 0 },
      radius: 4,
      color: { r: 1.0, g: 0.5, b: 0.2 },
      fadePercent: 0.6,
      style: "thermal",
    },
  },
  {
    id: "sand-patch",
    displayName: "Sandy Floor",
    targetTile: "sand",
    requiredTerrain: ["water"],
    frequency: 0.006,
    maxCount: 30,
    propagationChance: 0.7,
    propagationDecay: 0.9,
    maxPropagationDepth: 8,
    minDistanceFromSpawn: 2,
    minDistanceFromCapsule: 2,
    clusterSize: { min: 4, max: 16 },
  },
  {
    id: "mineral-deposit",
    displayName: "Mineral Deposit",
    targetTile: "wall",   // doesn't change terrain, adds light
    requiredTerrain: ["wall"],
    frequency: 0.002,
    maxCount: 10,
    propagationChance: 0.15,
    propagationDecay: 0.5,
    maxPropagationDepth: 2,
    minDistanceFromSpawn: 5,
    minDistanceFromCapsule: 3,
    clusterSize: { min: 1, max: 3 },
    placesLight: {
      position: { x: 0, y: 0 },
      radius: 3,
      color: { r: 0.9, g: 0.9, b: 1.0 },
      fadePercent: 0.8,
      style: "mineral",
    },
  },
  {
    id: "sea-grass",
    displayName: "Sea Grass Meadow",
    targetTile: "shallows",
    requiredTerrain: ["water", "sand"],
    frequency: 0.004,
    maxCount: 20,
    propagationChance: 0.6,
    propagationDecay: 0.88,
    maxPropagationDepth: 5,
    minDistanceFromSpawn: 3,
    minDistanceFromCapsule: 2,
    clusterSize: { min: 3, max: 10 },
  },
]
```

---

## Core Algorithm

```typescript
/**
 * Run the autogenerator across the entire map.
 * Iterates through the catalog, seeding and propagating features.
 */
export function runAutogenerators(
  tiles: TileKind[],
  width: number,
  height: number,
  spawn: Point,
  capsule: Point,
  catalog: readonly FeatureDefinition[],
  random: () => number,
): AutogenResult

Algorithm:
  placed: PlacedFeature[] = []
  lights: LightSource[] = []

  For each featureDef in catalog:
    count = 0

    // Collect eligible seed cells
    candidates = []
    For each (x, y) interior cell:
      tile = tiles[y * width + x]
      if tile not in featureDef.requiredTerrain: continue
      if chebyshevDistance({x,y}, spawn) < featureDef.minDistanceFromSpawn: continue
      if chebyshevDistance({x,y}, capsule) < featureDef.minDistanceFromCapsule: continue
      candidates.push({x, y})

    // Shuffle for randomness
    shuffle(candidates, random)

    // Attempt to seed features
    For each candidate in candidates:
      if count >= featureDef.maxCount: break
      if random() > featureDef.frequency: continue

      // Seed this cell
      clusterCells = propagateFeature(
        tiles, width, height,
        candidate,
        featureDef,
        random,
      )

      For each cell in clusterCells:
        if featureDef.targetTile !== tiles[cell.y * width + cell.x]:
          tiles[cell.y * width + cell.x] = featureDef.targetTile

        placed.push({ id: featureDef.id, position: cell, fromPropagation: cell !== candidate })

        if featureDef.placesLight:
          lights.push({ ...featureDef.placesLight, position: { ...cell } })

        count += 1
        if count >= featureDef.maxCount: break

  Return { tiles, features: placed, lightSources: lights }
```

### Propagation

```typescript
function propagateFeature(
  tiles: TileKind[],
  width: number,
  height: number,
  seed: Point,
  def: FeatureDefinition,
  random: () => number,
): Point[]

Algorithm:
  result = [seed]
  frontier = [{ point: seed, chance: def.propagationChance, depth: 0 }]
  visited = Set<number> containing index of seed

  While frontier is not empty:
    { point, chance, depth } = frontier.shift()
    if depth >= def.maxPropagationDepth: continue

    For each cardinal neighbor (dx, dy) of point:
      nx = point.x + dx, ny = point.y + dy
      index = ny * width + nx
      if visited.has(index): continue
      if out of interior bounds: continue
      if tiles[index] not in def.requiredTerrain: continue
      visited.add(index)

      if random() < chance:
        result.push({ x: nx, y: ny })
        frontier.push({
          point: { x: nx, y: ny },
          chance: chance * def.propagationDecay,
          depth: depth + 1,
        })

      if result.length >= def.clusterSize.max: return result

  Return result
```

---

## Integration Contract

```typescript
// Used by Module 2G (Main Pipeline) — called after room accretion + lakes
export { runAutogenerators, FEATURE_CATALOG }
export { type FeatureDefinition, type PlacedFeature, type AutogenResult }

// Used by Module 2J (Machines) — machines may override local features
export { type FeatureDefinition, FEATURE_CATALOG }
```

---

## Test Spec

File: `src/game/mapgen/autogen_test.ts`

```
Deno.test("runAutogenerators is deterministic for same seed")
  - Run twice with same random, same tiles
  - assertEquals on resulting tiles and features

Deno.test("features only spawn on their required terrain")
  - Run autogenerators on a known grid
  - For each placed feature, verify the original tile at that position
    was in the feature's requiredTerrain list

Deno.test("features respect minDistanceFromSpawn")
  - Verify no feature is placed within minDistanceFromSpawn of spawn

Deno.test("features respect maxCount")
  - Run with a very high frequency to saturate
  - Verify count per feature type does not exceed maxCount

Deno.test("propagation creates connected clusters")
  - Seed a single kelp-patch
  - Verify all placed cells form a connected region (BFS)

Deno.test("propagation decays with depth")
  - Large grid, single feature with high propagation
  - Verify cluster size is within clusterSize.min..clusterSize.max bounds

Deno.test("bioluminescence features produce light sources")
  - Run autogenerators, filter for bioluminescence features
  - Verify each has a corresponding LightSource in the result

Deno.test("features do not overwrite spawn or capsule cells")
  - Place spawn/capsule, run autogenerators
  - Verify tiles at spawn and capsule positions are still "water"
```
