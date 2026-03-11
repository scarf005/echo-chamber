import {
  MAX_SONAR_RADIUS,
  SONAR_DUST_BLOCK_THRESHOLD,
  SONAR_ENTITY_IDENTIFY_RADIUS,
  SONAR_SPEED,
} from "../constants.ts"
import { indexAlphaLookup } from "../effects.ts"
import { bresenhamLine, euclideanDistance, indexForPoint } from "../helpers.ts"
import type {
  EntityReveal,
  EntityRevealKind,
  FadeCell,
  RevealableEntity,
  Shockwave,
  TileReveal,
} from "../model.ts"
import {
  type GeneratedMap,
  isSonarBlockingTile,
  type Point,
  tileAt,
  type TileKind,
} from "../mapgen.ts"

export const stepShockwaves = (
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
} => {
  const front = new Map<number, FadeCell>()
  const revealedTiles = new Map<number, TileKind>()
  const revealedEntities = new Map<string, EntityReveal>()
  const dustByIndex = indexAlphaLookup(dust)
  const entitiesByIndex = buildEntitiesByIndex(map.width, revealableEntities)
  const blockerIndexes = buildBlockerIndexes(
    map.width,
    revealableEntities,
    trails,
  )
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
      wave.senderId,
      false,
    )
  }

  for (const wave of spawnedWaves) {
    mergeFrontCell(
      front,
      indexForPoint(map.width, wave.origin),
      1,
      wave.senderId !== "player",
    )

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
      wave.senderId,
      true,
    )
  }

  return {
    waves: nextWaves,
    front: Array.from(front.values()),
    revealedTiles: Array.from(
      revealedTiles,
      ([index, tile]) => ({ index, tile }),
    ),
    revealedEntities: Array.from(revealedEntities.values()),
  }
}

export const previewShockwaveEntityReveals = (
  map: GeneratedMap,
  waves: Shockwave[],
  spawnedWaves: Shockwave[],
  dust: FadeCell[],
  trails: FadeCell[],
  revealableEntities: RevealableEntity[],
): EntityReveal[] => {
  const revealedEntities = new Map<string, EntityReveal>()
  const dustByIndex = indexAlphaLookup(dust)
  const entitiesByIndex = buildEntitiesByIndex(map.width, revealableEntities)
  const blockerIndexes = buildBlockerIndexes(
    map.width,
    revealableEntities,
    trails,
  )
  const noopFront = new Map<number, FadeCell>()
  const noopTiles = new Map<number, TileKind>()
  const noopNextWaves: Shockwave[] = []

  for (const wave of waves) {
    advanceShockwave(
      map,
      wave,
      dustByIndex,
      entitiesByIndex,
      blockerIndexes,
      noopFront,
      noopTiles,
      revealedEntities,
      noopNextWaves,
      wave.senderId,
      false,
    )
  }

  for (const wave of spawnedWaves) {
    advanceShockwave(
      map,
      wave,
      dustByIndex,
      entitiesByIndex,
      blockerIndexes,
      noopFront,
      noopTiles,
      revealedEntities,
      noopNextWaves,
      wave.senderId,
      true,
    )
  }

  return Array.from(revealedEntities.values())
}

export const didShockwaveReachPointThisTurn = (
  map: GeneratedMap,
  wave: Shockwave,
  dust: FadeCell[],
  trails: FadeCell[],
  revealableEntities: RevealableEntity[],
  point: Point,
  spawnedThisTurn: boolean,
): boolean => {
  const pointIndex = indexForPoint(map.width, point)
  const dustByIndex = indexAlphaLookup(dust)
  const entitiesByIndex = buildEntitiesByIndex(map.width, revealableEntities)
  const blockerIndexes = buildBlockerIndexes(
    map.width,
    revealableEntities,
    trails,
  )
  const trace = traceWaveBand(
    map,
    wave,
    spawnedThisTurn ? -1 : wave.radius,
    Math.min(MAX_SONAR_RADIUS, wave.radius + SONAR_SPEED),
    dustByIndex,
    entitiesByIndex,
    blockerIndexes,
  )

  return trace.front.has(pointIndex)
}

const advanceShockwave = (
  map: GeneratedMap,
  wave: Shockwave,
  dustByIndex: Map<number, number>,
  entitiesByIndex: Map<number, RevealableEntity[]>,
  blockerIndexes: Set<number>,
  front: Map<number, FadeCell>,
  revealedTiles: Map<number, TileKind>,
  revealedEntities: Map<string, EntityReveal>,
  nextWaves: Shockwave[],
  senderId: string,
  spawnedThisTurn: boolean,
): void => {
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
    mergeFrontCell(front, index, alpha, wave.senderId !== "player")
  }

  trace.revealedTiles.forEach((tile, index) => {
    revealedTiles.set(index, tile)
  })

  trace.revealedEntities.forEach((kind, key) => {
    const [indexText] = key.split(":")
    revealedEntities.set(`${senderId}:${key}`, {
      index: Number(indexText),
      kind,
      sourceSenderId: senderId,
    })
  })

  if (nextRadius < MAX_SONAR_RADIUS && trace.front.size > 0) {
    nextWaves.push({ ...wave, origin: { ...wave.origin }, radius: nextRadius })
  }
}

const traceWaveBand = (
  map: GeneratedMap,
  wave: Shockwave,
  previousRadius: number,
  nextRadius: number,
  dustByIndex: Map<number, number>,
  entitiesByIndex: Map<number, RevealableEntity[]>,
  blockerIndexes: Set<number>,
): {
  front: Map<number, number>
  revealedTiles: Map<number, TileKind>
  revealedEntities: Map<string, EntityRevealKind>
} => {
  const front = new Map<number, number>()
  const revealedTiles = new Map<number, TileKind>()
  const revealedEntities = new Map<string, EntityRevealKind>()
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
          front.set(
            mapIndex,
            Math.max(front.get(mapIndex) ?? 0, waveAlpha(distance) * 0.6),
          )
        }

        break
      }

      if (isSonarBlockingTile(tile)) {
        if (distance > previousRadius) {
          if (wave.revealTerrain) {
            revealedTiles.set(mapIndex, tile)
          }

          if (wave.revealEntities) {
            revealEntitiesAtIndex(
              revealedEntities,
              entitiesByIndex.get(mapIndex),
              mapIndex,
              distance,
            )
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
          revealEntitiesAtIndex(
            revealedEntities,
            entitiesByIndex.get(mapIndex),
            mapIndex,
            distance,
          )
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

const buildBlockerIndexes = (
  width: number,
  revealableEntities: RevealableEntity[],
  trails: FadeCell[],
): Set<number> => {
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

const buildEntitiesByIndex = (
  width: number,
  revealableEntities: RevealableEntity[],
): Map<number, RevealableEntity[]> => {
  return revealableEntities.reduce((lookup, entity) => {
    const index = indexForPoint(width, entity.position)
    const current = lookup.get(index) ?? []
    lookup.set(index, [...current, entity])
    return lookup
  }, new Map<number, RevealableEntity[]>())
}

const revealEntitiesAtIndex = (
  reveals: Map<string, EntityRevealKind>,
  entities: RevealableEntity[] | undefined,
  index: number,
  distance: number,
): void => {
  if (!entities || distance >= SONAR_ENTITY_IDENTIFY_RADIUS) {
    return
  }

  for (const entity of entities) {
    const revealedKind = toEntityRevealKind(entity)

    if (!revealedKind) {
      continue
    }

    reveals.set(`${index}:${revealedKind}`, revealedKind)
  }
}

const toEntityRevealKind = (
  entity: RevealableEntity,
): EntityRevealKind | null => {
  switch (entity.kind) {
    case "player":
      return "player"
    case "capsule":
      return "capsule"
    case "item":
      return "item"
    case "torpedo":
      return entity.senderId === "player" ? null : "enemy"
    case "depth-charge":
      return entity.senderId === "player" ? null : "enemy"
    case "hostile-submarine":
      return "enemy"
    case "fish":
      return "non-hostile"
    default:
      return null
  }
}

const waveAlpha = (distance: number): number => {
  return Math.max(
    0.18,
    Number((1 - distance / (MAX_SONAR_RADIUS + 1)).toFixed(3)),
  )
}

const mergeFrontCell = (
  front: Map<number, FadeCell>,
  index: number,
  alpha: number,
  requiresVisibility: boolean,
): void => {
  const current = front.get(index)

  if (!current) {
    front.set(index, { index, alpha, requiresVisibility })
    return
  }

  front.set(index, {
    index,
    alpha: Math.max(current.alpha, alpha),
    requiresVisibility: current.requiresVisibility && requiresVisibility,
  })
}
