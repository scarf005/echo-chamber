import { MAX_SONAR_RADIUS, SONAR_DUST_BLOCK_THRESHOLD, SONAR_SPEED } from "../constants.ts"
import { indexAlphaLookup } from "../effects.ts"
import { bresenhamLine, euclideanDistance, indexForPoint } from "../helpers.ts"
import type { FadeCell, SonarWave } from "../model.ts"
import { tileAt, type GeneratedMap, type Point, type TileKind } from "../mapgen.ts"

export function stepSonar(
  map: GeneratedMap,
  emitter: Point,
  waves: SonarWave[],
  emitNewWave: boolean,
  dust: FadeCell[],
  shockwaveOrigins: Point[] = [],
): {
  waves: SonarWave[]
  front: FadeCell[]
  revealed: Array<{ index: number; tile: TileKind }>
} {
  const front = new Map<number, number>()
  const reveals = new Map<number, TileKind>()
  const nextWaves: SonarWave[] = []
  const dustByIndex = indexAlphaLookup(dust)

  for (const wave of waves) {
    const nextRadius = Math.min(MAX_SONAR_RADIUS, wave.radius + SONAR_SPEED)
    const trace = traceWaveBand(
      map,
      wave.origin,
      wave.radius,
      nextRadius,
      dustByIndex,
    )

    for (const [index, alpha] of trace.front) {
      front.set(index, Math.max(front.get(index) ?? 0, alpha))
    }

    trace.revealed.forEach((tile, index) => reveals.set(index, tile))

    if (nextRadius < MAX_SONAR_RADIUS && trace.front.size > 0) {
      nextWaves.push({ origin: { ...wave.origin }, radius: nextRadius })
    }
  }

  if (emitNewWave) {
    nextWaves.push({ origin: { ...emitter }, radius: 0 })
    front.set(indexForPoint(map.width, emitter), 1)
  }

  for (const origin of shockwaveOrigins) {
    nextWaves.push({ origin: { ...origin }, radius: 0 })
    front.set(indexForPoint(map.width, origin), 1)
  }

  return {
    waves: nextWaves,
    front: Array.from(front, ([index, alpha]) => ({ index, alpha })),
    revealed: Array.from(reveals, ([index, tile]) => ({ index, tile })),
  }
}

function traceWaveBand(
  map: GeneratedMap,
  origin: Point,
  previousRadius: number,
  nextRadius: number,
  dustByIndex: Map<number, number>,
): {
  front: Map<number, number>
  revealed: Map<number, TileKind>
} {
  const front = new Map<number, number>()
  const revealed = new Map<number, TileKind>()
  const rayCount = Math.max(64, Math.ceil(nextRadius * 18))

  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index / rayCount) * Math.PI * 2
    const target = {
      x: Math.round(origin.x + Math.cos(angle) * nextRadius),
      y: Math.round(origin.y + Math.sin(angle) * nextRadius),
    }
    const line = bresenhamLine(origin, target)

    for (let lineIndex = 1; lineIndex < line.length; lineIndex += 1) {
      const point = line[lineIndex]
      const tile = tileAt(map, point.x, point.y)

      if (!tile) {
        break
      }

      const distance = euclideanDistance(origin, point)

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
          revealed.set(mapIndex, tile)
          front.set(mapIndex, waveAlpha(distance))
        }

        break
      }

      if (distance > previousRadius) {
        revealed.set(mapIndex, tile)
        front.set(mapIndex, waveAlpha(distance))
      }
    }
  }

  return { front, revealed }
}

function waveAlpha(distance: number): number {
  return Math.max(0.18, Number((1 - distance / (MAX_SONAR_RADIUS + 1)).toFixed(3)))
}
