import { BOULDER_DUST_ALPHA, BOULDER_IMPACT_DUST_ALPHA } from "../constants.ts"
import { mergeFadeCell, mergeFadeCells } from "../effects.ts"
import type { FadeCell, FallingBoulder } from "../model.ts"
import { indexForPoint } from "../helpers.ts"
import { tileAt, type GeneratedMap, type Point } from "../mapgen.ts"

export function stepFallingBoulders(
  map: GeneratedMap,
  boulders: FallingBoulder[],
  dust: FadeCell[],
): {
  fallingBoulders: FallingBoulder[]
  dust: FadeCell[]
  landings: number
  screenShake: number
} {
  const nextBoulders: FallingBoulder[] = []
  let nextDust = dust
  let landings = 0

  for (const boulder of boulders) {
    let current = { ...boulder.position }
    let landed = false

    for (let step = 0; step < boulder.speed; step += 1) {
      nextDust = mergeFadeCell(
        nextDust,
        indexForPoint(map.width, current),
        BOULDER_DUST_ALPHA,
      )

      const nextPoint = { x: current.x, y: current.y + 1 }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      if (!tile || tile === "wall") {
        nextDust = mergeFadeCells(
          nextDust,
          createDustBurst(map, current, BOULDER_IMPACT_DUST_ALPHA),
        )
        landed = true
        landings += 1
        break
      }

      current = nextPoint
    }

    if (!landed) {
      nextBoulders.push({
        ...boulder,
        position: current,
      })
    }
  }

  return {
    fallingBoulders: nextBoulders,
    dust: nextDust,
    landings,
    screenShake: landings > 0 ? 0.75 : 0,
  }
}

export function createDustBurst(
  map: GeneratedMap,
  center: Point,
  alpha: number,
): FadeCell[] {
  const cells: FadeCell[] = []

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const point = {
        x: center.x + offsetX,
        y: center.y + offsetY,
      }
      const tile = tileAt(map, point.x, point.y)

      if (!tile || tile === "wall") {
        continue
      }

      const falloff = Math.max(0.32, 1 - Math.max(Math.abs(offsetX), Math.abs(offsetY)) * 0.35)
      cells.push({
        index: indexForPoint(map.width, point),
        alpha: Number((alpha * falloff).toFixed(3)),
      })
    }
  }

  return cells
}
