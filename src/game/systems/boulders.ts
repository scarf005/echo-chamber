import { BOULDER_DUST_ALPHA, BOULDER_IMPACT_DUST_ALPHA } from "../constants.ts"
import {
  createDustBurst,
  mergeFadeCell,
  mergeFadeCells,
  mergeTrailCell,
} from "../effects.ts"
import { indexForPoint, pointsEqual } from "../helpers.ts"
import { type GeneratedMap, tileAt } from "../mapgen.ts"
import type {
  FadeCell,
  FallingBoulder,
  Fish,
  HostileSubmarine,
} from "../model.ts"
import type { Point } from "../mapgen.ts"

export const stepFallingBoulders = (
  map: GeneratedMap,
  boulders: FallingBoulder[],
  trails: FadeCell[],
  dust: FadeCell[],
  player: Point,
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
): {
  fallingBoulders: FallingBoulder[]
  trails: FadeCell[]
  dust: FadeCell[]
  fish: Fish[]
  hostileSubmarines: HostileSubmarine[]
  landings: number
  landingPoints: Point[]
  screenShake: number
  playerDestroyed: boolean
} => {
  const nextBoulders: FallingBoulder[] = []
  let nextTrails = trails
  let nextDust = dust
  let nextFish = fish
  let nextHostiles = hostileSubmarines
  let landings = 0
  const landingPoints: Point[] = []
  let playerDestroyed = false

  for (const boulder of boulders) {
    let current = { ...boulder.position }
    let landed = false

    for (let step = 0; step < boulder.speed; step += 1) {
      const crushedAtCurrent = crushEntitiesAtPoint(
        current,
        player,
        nextFish,
        nextHostiles,
      )
      nextFish = crushedAtCurrent.fish
      nextHostiles = crushedAtCurrent.hostileSubmarines
      playerDestroyed = playerDestroyed || crushedAtCurrent.playerDestroyed

      nextTrails = mergeTrailCell(
        nextTrails,
        indexForPoint(map.width, current),
        1,
        "up",
      )
      nextDust = mergeFadeCell(
        nextDust,
        indexForPoint(map.width, current),
        BOULDER_DUST_ALPHA,
      )

      const nextPoint = { x: current.x, y: current.y + 1 }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      if (!tile || tile === "wall") {
        map.tiles[indexForPoint(map.width, current)] = "wall"
        nextDust = mergeFadeCells(
          nextDust,
          createDustBurst(map, current, BOULDER_IMPACT_DUST_ALPHA),
        )
        landed = true
        landings += 1
        landingPoints.push({ ...current })
        break
      }

      current = nextPoint
      const crushedAfterMove = crushEntitiesAtPoint(
        current,
        player,
        nextFish,
        nextHostiles,
      )
      nextFish = crushedAfterMove.fish
      nextHostiles = crushedAfterMove.hostileSubmarines
      playerDestroyed = playerDestroyed || crushedAfterMove.playerDestroyed
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
    trails: nextTrails,
    dust: nextDust,
    fish: nextFish,
    hostileSubmarines: nextHostiles,
    landings,
    landingPoints,
    screenShake: landings > 0 ? 0.75 : 0,
    playerDestroyed,
  }
}

const crushEntitiesAtPoint = (
  point: Point,
  player: Point,
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
): {
  fish: Fish[]
  hostileSubmarines: HostileSubmarine[]
  playerDestroyed: boolean
} => {
  return {
    fish: fish.filter((candidate) => !pointsEqual(candidate.position, point)),
    hostileSubmarines: hostileSubmarines.filter((candidate) =>
      !pointsEqual(candidate.position, point)
    ),
    playerDestroyed: pointsEqual(player, point),
  }
}
