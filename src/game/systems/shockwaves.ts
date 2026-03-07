import { MAX_SONAR_RADIUS, SONAR_DUST_BLOCK_THRESHOLD, SONAR_SPEED } from "../constants.ts"
import { indexAlphaLookup } from "../effects.ts"
import { bresenhamLine, euclideanDistance, indexForPoint } from "../helpers.ts"
import type {
  EntityReveal,
  FadeCell,
  RevealableEntity,
  RevealableEntityKind,
  Shockwave,
  TileReveal,
} from "../model.ts"
import { tileAt, type GeneratedMap, type Point, type TileKind } from "../mapgen.ts"

export function stepShockwaves(
  map: GeneratedMap,
  waves: Shockwave[],
  spawnedWaves: Shockwave[],
  dust: FadeCell[],
  trails: FadeCell[],
  revealableEntities: RevealableEntity[],
): {
  waves: Shockwave[]
  front: FadeCell[]
  revealedTiles: TileReveal[]
  revealedEntities: EntityReveal[]
} {
  const front = new Map<number, number>()
  const revealedTiles = new Map<number, TileKind>()
  const revealedEntities = new Map<string, EntityReveal>()
  const dustByIndex = indexAlphaLookup(dust)
  const entitiesByIndex = buildEntitiesByIndex(map.width, revealableEntities)
  const blockerIndexes = buildBlockerIndexes(map.width, revealableEntities, trails)
  const nextWaves: Shockwave[] = []

  for (const wave of waves) {
    advanceShockwave(
      map,
      wave,
      dustByIndex,
      entitiesByIndex,
      blockerIndexes,
      front,
      revealedTiles,
      revealedEntities,
      nextWaves,
      false,
    )
  }

  for (const wave of spawnedWaves) {
    front.set(indexForPoint(map.width, wave.origin), 1)
    advanceShockwave(
      map,
      wave,
      dustByIndex,
      entitiesByIndex,
      blockerIndexes,
      front,
      revealedTiles,
      revealedEntities,
      nextWaves,
      true,
    )
  }

  return {
    waves: nextWaves,
    front: Array.from(front, ([index, alpha]) => ({ index, alpha })),
    revealedTiles: Array.from(revealedTiles, ([index, tile]) => ({ index, tile })),
    revealedEntities: Array.from(revealedEntities.values()),
  }
}

function advanceShockwave(
  map: GeneratedMap,
  wave: Shockwave,
  dustByIndex: Map<number, number>,
  entitiesByIndex: Map<number, RevealableEntityKind[]>,
  blockerIndexes: Set<number>,
  front: Map<number, number>,
  revealedTiles: Map<number, TileKind>,
  revealedEntities: Map<string, EntityReveal>,
  nextWaves: Shockwave[],
  spawnedThisTurn: boolean,
): void {
  const nextRadius = Math.min(MAX_SONAR_RADIUS, wave.radius + SONAR_SPEED)
  const trace = traceWaveBand(
    map,
    wave,
    spawnedThisTurn ? -1 : wave.radius,
    nextRadius,
    dustByIndex,
    entitiesByIndex,
    blockerIndexes,
  )

  for (const [index, alpha] of trace.front) {
    front.set(index, Math.max(front.get(index) ?? 0, alpha))
  }

  trace.revealedTiles.forEach((tile, index) => revealedTiles.set(index, tile))

  trace.revealedEntities.forEach((kind, key) => {
    const [indexText] = key.split(":")
    revealedEntities.set(key, { index: Number(indexText), kind })
  })

  if (nextRadius < MAX_SONAR_RADIUS && trace.front.size > 0) {
    nextWaves.push({ ...wave, origin: { ...wave.origin }, radius: nextRadius })
  }
}

function traceWaveBand(
  map: GeneratedMap,
  wave: Shockwave,
  previousRadius: number,
  nextRadius: number,
  dustByIndex: Map<number, number>,
  entitiesByIndex: Map<number, RevealableEntityKind[]>,
  blockerIndexes: Set<number>,
): {
  front: Map<number, number>
  revealedTiles: Map<number, TileKind>
  revealedEntities: Map<string, RevealableEntityKind>
} {
  const front = new Map<number, number>()
  const revealedTiles = new Map<number, TileKind>()
  const revealedEntities = new Map<string, RevealableEntityKind>()
  const rayCount = Math.max(64, Math.ceil(nextRadius * 18))

  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index / rayCount) * Math.PI * 2
    const target = {
      x: Math.round(wave.origin.x + Math.cos(angle) * nextRadius),
      y: Math.round(wave.origin.y + Math.sin(angle) * nextRadius),
    }
    const line = bresenhamLine(wave.origin, target)

    for (let lineIndex = 1; lineIndex < line.length; lineIndex += 1) {
      const point = line[lineIndex]
      const tile = tileAt(map, point.x, point.y)

      if (!tile) {
        break
      }

      const distance = euclideanDistance(wave.origin, point)

      if (distance > nextRadius + 0.5 || distance > MAX_SONAR_RADIUS + 0.5) {
        break
      }

      const mapIndex = indexForPoint(map.width, point)
      const dustAlpha = dustByIndex.get(mapIndex) ?? 0

      if (dustAlpha >= SONAR_DUST_BLOCK_THRESHOLD) {
        if (distance > previousRadius) {
          front.set(mapIndex, Math.max(front.get(mapIndex) ?? 0, waveAlpha(distance) * 0.6))
        }

        break
      }

      if (tile === "wall") {
        if (distance > previousRadius) {
          if (wave.revealTerrain) {
            revealedTiles.set(mapIndex, tile)
          }

          if (wave.revealEntities) {
            revealEntitiesAtIndex(revealedEntities, entitiesByIndex.get(mapIndex), mapIndex)
          }

          front.set(mapIndex, waveAlpha(distance))
        }

        break
      }

      if (distance > previousRadius) {
        if (wave.revealTerrain) {
          revealedTiles.set(mapIndex, tile)
        }

        if (wave.revealEntities) {
          revealEntitiesAtIndex(revealedEntities, entitiesByIndex.get(mapIndex), mapIndex)
        }

        front.set(mapIndex, waveAlpha(distance))
      }

      if (blockerIndexes.has(mapIndex)) {
        break
      }
    }
  }

  return { front, revealedTiles, revealedEntities }
}

function buildBlockerIndexes(
  width: number,
  revealableEntities: RevealableEntity[],
  trails: FadeCell[],
): Set<number> {
  const blockerIndexes = new Set<number>()

  for (const entity of revealableEntities) {
    if (entity.kind === "player") {
      continue
    }

    blockerIndexes.add(indexForPoint(width, entity.position))
  }

  for (const trail of trails) {
    blockerIndexes.add(trail.index)
  }

  return blockerIndexes
}

function buildEntitiesByIndex(
  width: number,
  revealableEntities: RevealableEntity[],
): Map<number, RevealableEntityKind[]> {
  return revealableEntities.reduce((lookup, entity) => {
    const index = indexForPoint(width, entity.position)
    const current = lookup.get(index) ?? []
    lookup.set(index, [...current, entity.kind])
    return lookup
  }, new Map<number, RevealableEntityKind[]>())
}

function revealEntitiesAtIndex(
  reveals: Map<string, RevealableEntityKind>,
  kinds: RevealableEntityKind[] | undefined,
  index: number,
): void {
  if (!kinds) {
    return
  }

  for (const kind of kinds) {
    reveals.set(`${index}:${kind}`, kind)
  }
}

function waveAlpha(distance: number): number {
  return Math.max(0.18, Number((1 - distance / (MAX_SONAR_RADIUS + 1)).toFixed(3)))
}
