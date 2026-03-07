import { Path } from "npm:rot-js@2.2.1"

import { deltaForDirection, horizontalFacingForMove } from "./helpers.ts"
import { keyOfPoint, pointsEqual } from "./helpers.ts"
import { withGameMessage } from "./log.ts"
import type { Direction, GameState, HorizontalDirection } from "./model.ts"
import { isPassableTile } from "./mapgen.ts"
import { advanceTurn } from "./turn.ts"
import { type GeneratedMap, type Point, tileAt } from "./mapgen.ts"

export interface AutoMoveAnomaly {
  point: Point
  reason: string
}

export function keyForAutoMoveAnomaly(anomaly: AutoMoveAnomaly): string {
  return `${keyOfPoint(anomaly.point)}:${anomaly.reason}`
}

export function findPath(
  map: GeneratedMap,
  start: Point,
  destination: Point,
  isPassable: (point: Point) => boolean = (point) =>
    isPassableTile(tileAt(map, point.x, point.y)),
): Point[] {
  if (!isPassable(destination)) {
    return []
  }

  const path: Point[] = []
  const astar = new Path.AStar(
    destination.x,
    destination.y,
    (x, y) => isPassable({ x, y }),
    { topology: 4 },
  )

  astar.compute(start.x, start.y, (x, y) => {
    path.push({ x, y })
  })

  return path
}

export function directionBetweenPoints(
  from: Point,
  to: Point,
): Direction | null {
  if (pointsEqual(from, to)) {
    return null
  }

  if (to.x > from.x) {
    return "right"
  }

  if (to.x < from.x) {
    return "left"
  }

  if (to.y > from.y) {
    return "down"
  }

  if (to.y < from.y) {
    return "up"
  }

  return null
}

export function isAutoMoveNavigable(game: GameState, point: Point): boolean {
  if (
    point.x < 0 || point.x >= game.map.width ||
    point.y < 0 || point.y >= game.map.height
  ) {
    return false
  }

  const index = point.y * game.map.width + point.x

  if (game.visibility[index] > 0) {
    return isPassableTile(tileAt(game.map, point.x, point.y))
  }

  return game.memory[index] !== "wall"
}

export function findAutoMovePath(game: GameState, destination: Point): Point[] {
  if (game.status !== "playing") {
    return []
  }

  return findPath(
    game.map,
    game.player,
    destination,
    (point) => isAutoMoveNavigable(game, point),
  )
}

export function shouldHaltAutoMoveForAnomaly(
  seenAnomalies: ReadonlySet<string>,
  anomaly: AutoMoveAnomaly | null,
): anomaly is AutoMoveAnomaly {
  return anomaly !== null && !seenAnomalies.has(keyForAutoMoveAnomaly(anomaly))
}

export function findAutoMoveAnomaly(game: GameState): AutoMoveAnomaly | null {
  const visibleHostile = firstVisiblePoint(
    game,
    game.hostileSubmarines.map((hostileSubmarine) => ({
      point: hostileSubmarine.position,
      reason: reasonForVisibility(
        game,
        hostileSubmarine.position,
        "hostile submarine in sight",
      ),
    })),
  )

  if (visibleHostile) {
    return visibleHostile
  }

  const visibleTorpedo = firstVisiblePoint(
    game,
    game.torpedoes.map((torpedo) => ({
      point: torpedo.position,
      reason: "torpedo in sight",
    })),
  )

  if (visibleTorpedo) {
    return visibleTorpedo
  }

  const visibleDepthCharge = firstVisiblePoint(
    game,
    game.depthCharges.map((depthCharge) => ({
      point: depthCharge.position,
      reason: "depth charge in sight",
    })),
  )

  if (visibleDepthCharge) {
    return visibleDepthCharge
  }

  const visibleBoulder = firstVisiblePoint(
    game,
    game.fallingBoulders.map((boulder) => ({
      point: boulder.position,
      reason: "falling boulder in sight",
    })),
  )

  if (visibleBoulder) {
    return visibleBoulder
  }

  const visiblePickup = firstVisiblePoint(
    game,
    game.pickups.map((pickup) => ({
      point: pickup.position,
      reason: reasonForVisibility(
        game,
        pickup.position,
        pickup.kind === "torpedo-cache"
          ? "torpedo cache in sight"
          : pickup.kind === "depth-charge-cache"
          ? "depth charge cache in sight"
          : "survey map in sight",
      ),
    })),
  )

  if (visiblePickup) {
    return visiblePickup
  }

  const capsuleIndex = game.map.capsule.y * game.map.width + game.map.capsule.x

  if (
    game.capsuleKnown &&
    game.visibility[capsuleIndex] > 0 &&
    !pointsEqual(game.player, game.map.capsule)
  ) {
    return {
      point: game.map.capsule,
      reason: "capsule in sight",
    }
  }

  return null
}

function firstVisiblePoint(
  game: GameState,
  entries: AutoMoveAnomaly[],
): AutoMoveAnomaly | null {
  return entries.find((entry) => {
    if (pointsEqual(entry.point, game.player)) {
      return false
    }

    const index = entry.point.y * game.map.width + entry.point.x
    return game.visibility[index] > 0
  }) ?? null
}

function reasonForVisibility(
  game: GameState,
  point: Point,
  exactReason: string,
): string {
  const index = point.y * game.map.width + point.x
  return game.visibility[index] >= 3 ? exactReason : "sonar contact"
}

export function directionFromKey(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up"
    case "ArrowDown":
    case "s":
    case "S":
      return "down"
    case "ArrowLeft":
    case "a":
    case "A":
      return "left"
    case "ArrowRight":
    case "d":
    case "D":
      return "right"
    default:
      return null
  }
}

export function isPlayerSonarEnabled(
  game: Pick<GameState, "playerSonarEnabled">,
): boolean {
  return game.playerSonarEnabled ?? true
}

export function togglePlayerSonar(game: GameState): GameState {
  if (game.status !== "playing") {
    return game
  }

  const enabled = !isPlayerSonarEnabled(game)

  return withGameMessage(
    {
      ...game,
      playerSonarEnabled: enabled,
    },
    enabled ? "Player sonar enabled." : "Player sonar disabled.",
  )
}

export function movePlayer(game: GameState, direction: Direction): GameState {
  if (game.status !== "playing") {
    return game
  }

  const delta = deltaForDirection(direction)
  const target = {
    x: game.player.x + delta.x,
    y: game.player.y + delta.y,
  }

  if (!isPassableTile(tileAt(game.map, target.x, target.y))) {
    return withGameMessage({
      ...game,
      facing: horizontalFacingForMove(game.facing, direction),
    }, "Hull blocked.")
  }

  return advanceTurn(
    game,
    target,
    horizontalFacingForMove(game.facing, direction),
    null,
    "Advance.",
  )
}

export function holdPosition(game: GameState): GameState {
  if (game.status !== "playing") {
    return game
  }

  return advanceTurn(game, game.player, game.facing, null, "Holding position.")
}

export function fireTorpedo(
  game: GameState,
  direction: HorizontalDirection = game.facing,
): GameState {
  if (game.status !== "playing") {
    return game
  }

  if (game.torpedoAmmo <= 0) {
    return withGameMessage({
      ...game,
      facing: direction,
    }, "No torpedoes remaining.")
  }

  return advanceTurn(
    game,
    game.player,
    direction,
    { kind: "torpedo", direction },
    direction === "left" ? "Tube away to port." : "Tube away to starboard.",
  )
}

export function dropDepthCharge(game: GameState): GameState {
  if (game.status !== "playing") {
    return game
  }

  if (game.depthChargeAmmo <= 0) {
    return withGameMessage({
      ...game,
    }, "No depth charges remaining.")
  }

  return advanceTurn(
    game,
    game.player,
    game.facing,
    { kind: "depth-charge" },
    "Depth charge away.",
  )
}
