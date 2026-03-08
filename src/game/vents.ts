import { mergeTrailCell } from "./effects.ts"
import { hashSeed, indexForPoint } from "./helpers.ts"
import type { FadeCell } from "./model.ts"
import { type GeneratedMap, type Point, tileAt } from "./mapgen.ts"

export function collectVentPoints(map: GeneratedMap): Point[] {
  const vents: Point[] = []

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      if (tileAt(map, x, y) === "vent") {
        vents.push({ x, y })
      }
    }
  }

  return vents
}

export function ventPlumeLength(
  seed: string,
  vent: Point,
  turn: number,
): number {
  const hash = hashSeed(`${seed}:vent-plume:${vent.x}:${vent.y}:${turn}`)
  return 3 + (hash % 6)
}

export function ventPlumePoints(
  map: GeneratedMap,
  seed: string,
  turn: number,
  vent: Point,
): Point[] {
  const plume: Point[] = []
  const length = ventPlumeLength(seed, vent, turn)

  for (let offset = 1; offset <= length; offset += 1) {
    const point = { x: vent.x, y: vent.y - offset }
    const tile = tileAt(map, point.x, point.y)

    if (!tile || tile === "wall") {
      break
    }

    plume.push(point)
  }

  return plume
}

export function emitVentPlumes(
  map: GeneratedMap,
  seed: string,
  turn: number,
  trails: FadeCell[],
): FadeCell[] {
  let nextTrails = trails.filter((cell) => cell.source !== "vent")

  for (const vent of collectVentPoints(map)) {
    const plume = ventPlumePoints(map, seed, turn, vent)

    for (let index = 0; index < plume.length; index += 1) {
      nextTrails = mergeTrailCell(
        nextTrails,
        indexForPoint(map.width, plume[index]),
        Number(Math.max(0.28, 1 - index * 0.12).toFixed(3)),
        undefined,
        "vent",
      )
    }
  }

  return nextTrails
}
