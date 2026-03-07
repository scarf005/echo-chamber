import type { CrackCell, DepthCharge, FadeCell, FallingBoulder, Torpedo } from "../model.ts"
import { mergeCrackCells, mergeFadeCell, mergeFadeCells } from "../effects.ts"
import { indexForPoint, isNearObstacleBelow } from "../helpers.ts"
import { tileAt, type GeneratedMap, type Point } from "../mapgen.ts"
import { detonateTorpedo } from "./destruction.ts"

export function stepTorpedoes(
  map: GeneratedMap,
  torpedoes: Torpedo[],
  trails: FadeCell[],
  cracks: CrackCell[],
  dust: FadeCell[],
  seed: string,
  turn: number,
): {
  torpedoes: Torpedo[]
  trails: FadeCell[]
  cracks: CrackCell[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  impacts: number
  caveIns: number
  screenShake: number
  shockwaveOrigins: Point[]
} {
  const nextTorpedoes: Torpedo[] = []
  let nextTrails = trails
  let nextCracks = cracks
  let nextDust = dust
  const fallingBoulders: FallingBoulder[] = []
  const shockwaveOrigins: Point[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0

  for (const torpedo of torpedoes) {
    let current = { ...torpedo.position }
    let remaining = torpedo.rangeRemaining
    let exploded = false

    for (let step = 0; step < torpedo.speed; step += 1) {
      if (remaining <= 0) {
        break
      }

      const nextPoint = {
        x: current.x + (torpedo.direction === "left" ? -1 : 1),
        y: current.y,
      }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      nextTrails = mergeFadeCell(
        nextTrails,
        indexForPoint(map.width, current),
        0.82,
      )

      if (!tile || tile === "wall") {
        const impactPoint = tile ? nextPoint : current
        const explosion = detonateTorpedo(
          map,
          impactPoint,
          `${seed}:${turn}:${impactPoint.x}:${impactPoint.y}:${torpedo.direction}:${impacts}`,
        )

        nextTrails = mergeFadeCell(
          nextTrails,
          indexForPoint(map.width, impactPoint),
          1,
        )
        nextDust = mergeFadeCell(
          nextDust,
          indexForPoint(map.width, impactPoint),
          0.7,
        )
        nextCracks = mergeCrackCells(nextCracks, explosion.cracks)
        nextDust = mergeFadeCells(nextDust, explosion.dust)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaveOrigins.push({ ...impactPoint })
        exploded = true
        impacts += 1
        caveIns += explosion.fallingBoulders.length
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      current = nextPoint
      remaining -= 1
    }

    if (!exploded && remaining > 0) {
      nextTorpedoes.push({
        ...torpedo,
        position: current,
        rangeRemaining: remaining,
      })
    }
  }

  return {
    torpedoes: nextTorpedoes,
    trails: nextTrails,
    cracks: nextCracks,
    dust: nextDust,
    fallingBoulders,
    impacts,
    caveIns,
    screenShake,
    shockwaveOrigins,
  }
}

export function stepDepthCharges(
  map: GeneratedMap,
  depthCharges: DepthCharge[],
  trails: FadeCell[],
  cracks: CrackCell[],
  dust: FadeCell[],
  seed: string,
  turn: number,
): {
  depthCharges: DepthCharge[]
  trails: FadeCell[]
  cracks: CrackCell[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  impacts: number
  caveIns: number
  screenShake: number
  shockwaveOrigins: Point[]
} {
  const nextDepthCharges: DepthCharge[] = []
  let nextTrails = trails
  let nextCracks = cracks
  let nextDust = dust
  const fallingBoulders: FallingBoulder[] = []
  const shockwaveOrigins: Point[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0

  for (const depthCharge of depthCharges) {
    let current = { ...depthCharge.position }
    let remaining = depthCharge.rangeRemaining
    let exploded = false

    for (let step = 0; step < depthCharge.speed; step += 1) {
      if (remaining <= 0) {
        break
      }

      nextTrails = mergeFadeCell(
        nextTrails,
        indexForPoint(map.width, current),
        0.76,
      )

      const nextPoint = {
        x: current.x,
        y: current.y + 1,
      }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      if (!tile || tile === "wall") {
        const impactPoint = current
        const explosion = detonateTorpedo(
          map,
          impactPoint,
          `${seed}:${turn}:${impactPoint.x}:${impactPoint.y}:depth:${impacts}`,
        )

        nextTrails = mergeFadeCell(
          nextTrails,
          indexForPoint(map.width, impactPoint),
          1,
        )
        nextDust = mergeFadeCell(
          nextDust,
          indexForPoint(map.width, impactPoint),
          0.7,
        )
        nextCracks = mergeCrackCells(nextCracks, explosion.cracks)
        nextDust = mergeFadeCells(nextDust, explosion.dust)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaveOrigins.push({ ...impactPoint })
        exploded = true
        impacts += 1
        caveIns += explosion.fallingBoulders.length
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      current = nextPoint
      remaining -= 1

      if (isNearObstacleBelow(map, current)) {
        const explosion = detonateTorpedo(
          map,
          current,
          `${seed}:${turn}:${current.x}:${current.y}:depth:${impacts}`,
        )

        nextTrails = mergeFadeCell(
          nextTrails,
          indexForPoint(map.width, current),
          1,
        )
        nextDust = mergeFadeCell(
          nextDust,
          indexForPoint(map.width, current),
          0.7,
        )
        nextCracks = mergeCrackCells(nextCracks, explosion.cracks)
        nextDust = mergeFadeCells(nextDust, explosion.dust)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaveOrigins.push({ ...current })
        exploded = true
        impacts += 1
        caveIns += explosion.fallingBoulders.length
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }
    }

    if (!exploded && remaining > 0) {
      nextDepthCharges.push({
        ...depthCharge,
        position: current,
        rangeRemaining: remaining,
      })
    }
  }

  return {
    depthCharges: nextDepthCharges,
    trails: nextTrails,
    cracks: nextCracks,
    dust: nextDust,
    fallingBoulders,
    impacts,
    caveIns,
    screenShake,
    shockwaveOrigins,
  }
}
