import { i18n } from "../i18n.ts"
import { Path } from "rot-js"

import { deltaForDirection, horizontalFacingForMove } from "./helpers.ts"
import {
  exactEntityNameAtPoint,
  inSightReasonForEntity,
} from "./entity_labels.ts"
import { keyOfPoint, pointsEqual } from "./helpers.ts"
import { createLogMessage, withGameMessage } from "./log.ts"
import type { Direction, GameState, HorizontalDirection } from "./model.ts"
import { isPassableTile } from "./mapgen.ts"
import { advanceTurn } from "./turn.ts"
import { type GeneratedMap, type Point, tileAt } from "./mapgen.ts"

export interface AutoMoveAnomaly {
  point: Point
  reason: string
}

const autoMovePathCache = new WeakMap<GameState, Map<string, Point[]>>()

export const keyForAutoMoveAnomaly = (anomaly: AutoMoveAnomaly): string => {
  return `${keyOfPoint(anomaly.point)}:${anomaly.reason}`
}

export const findPath = (
  map: GeneratedMap,
  start: Point,
  destination: Point,
  isPassable: (point: Point) => boolean = (point) =>
    isPassableTile(tileAt(map, point.x, point.y)),
): Point[] => {
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

export const directionBetweenPoints = (
  from: Point,
  to: Point,
): Direction | null => {
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

export const isAutoMoveNavigable = (game: GameState, point: Point): boolean => {
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

export const findAutoMovePath = (
  game: GameState,
  destination: Point,
): Point[] => {
  if (game.status !== "playing") {
    return []
  }

  const destinationKey = keyOfPoint(destination)
  const cachedPath = autoMovePathCache.get(game)?.get(destinationKey)

  if (cachedPath) {
    return cachedPath
  }

  const path = findPath(
    game.map,
    game.player,
    destination,
    (point) => isAutoMoveNavigable(game, point),
  )

  const pathsByDestination = autoMovePathCache.get(game) ??
    new Map<string, Point[]>()
  pathsByDestination.set(destinationKey, path)
  autoMovePathCache.set(game, pathsByDestination)

  return path
}

export const shouldHaltAutoMoveForAnomaly = (
  seenAnomalies: ReadonlySet<string>,
  anomaly: AutoMoveAnomaly | null,
): anomaly is AutoMoveAnomaly => {
  return anomaly !== null && !seenAnomalies.has(keyForAutoMoveAnomaly(anomaly))
}

export const findAutoMoveAnomaly = (
  game: GameState,
): AutoMoveAnomaly | null => {
  const visibleHostile = firstVisiblePoint(
    game,
    [
      ...game.hostileSubmarines.map((hostileSubmarine) => ({
        point: hostileSubmarine.position,
        reason: reasonForVisibility(
          game,
          hostileSubmarine.position,
          inSightReasonForEntity(
            exactEntityNameAtPoint(game, hostileSubmarine.position) ??
              "enemy submarine",
          ),
        ),
      })),
      ...(game.fish ?? []).map((fish) => ({
        point: fish.position,
        reason: reasonForVisibility(
          game,
          fish.position,
          inSightReasonForEntity(
            exactEntityNameAtPoint(game, fish.position) ?? "fish",
          ),
        ),
      })),
    ],
  )

  if (visibleHostile) {
    return visibleHostile
  }

  const hostileSonarContact = firstVisibleEntityMemoryPoint(game, "enemy")

  if (hostileSonarContact) {
    return hostileSonarContact
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
    !(game.capsuleCollected ?? false) &&
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

const firstVisiblePoint = (
  game: GameState,
  entries: AutoMoveAnomaly[],
): AutoMoveAnomaly | null => {
  return entries.find((entry) => {
    if (pointsEqual(entry.point, game.player)) {
      return false
    }

    const index = entry.point.y * game.map.width + entry.point.x
    return game.visibility[index] > 0
  }) ?? null
}

const firstVisibleEntityMemoryPoint = (
  game: GameState,
  kind: NonNullable<GameState["entityMemory"]>[number],
): AutoMoveAnomaly | null => {
  const entityMemory = game.entityMemory ?? []

  for (let index = 0; index < entityMemory.length; index += 1) {
    if (entityMemory[index] !== kind || game.visibility[index] <= 0) {
      continue
    }

    const point = {
      x: index % game.map.width,
      y: Math.floor(index / game.map.width),
    }

    if (pointsEqual(point, game.player)) {
      continue
    }

    return {
      point,
      reason: "sonar",
    }
  }

  return null
}

const reasonForVisibility = (
  game: GameState,
  point: Point,
  exactReason: string,
): string => {
  const index = point.y * game.map.width + point.x
  return game.visibility[index] >= 3 ? exactReason : "sonar"
}

export const directionFromKey = (key: string): Direction | null => {
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

export const isPlayerSonarEnabled = (
  game: Pick<GameState, "playerSonarEnabled">,
): boolean => {
  return game.playerSonarEnabled ?? true
}

export const togglePlayerSonar = (game: GameState): GameState => {
  if (game.status !== "playing") {
    return game
  }

  const enabled = !isPlayerSonarEnabled(game)

  return withGameMessage(
    {
      ...game,
      playerSonarEnabled: enabled,
    },
    enabled
      ? createLogMessage(() => i18n._("Player sonar enabled."), "positive")
      : createLogMessage(() => i18n._("Player sonar disabled."), "negative"),
  )
}

export const movePlayer = (
  game: GameState,
  direction: Direction,
): GameState => {
  if (game.status !== "playing") {
    return game
  }

  const delta = deltaForDirection(direction)
  const target = {
    x: game.player.x + delta.x,
    y: game.player.y + delta.y,
  }

  if (!isPassableTile(tileAt(game.map, target.x, target.y))) {
    return withGameMessage(
      {
        ...game,
        facing: horizontalFacingForMove(game.facing, direction),
      },
      createLogMessage(() => i18n._("Hull blocked."), "warning"),
    )
  }

  return advanceTurn(
    game,
    target,
    horizontalFacingForMove(game.facing, direction),
    null,
    createLogMessage(() => i18n._("Advance."), "neutral"),
  )
}

export const holdPosition = (game: GameState): GameState => {
  if (game.status !== "playing") {
    return game
  }

  return advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    createLogMessage(() => i18n._("Holding position."), "neutral"),
  )
}

export const fireTorpedo = (
  game: GameState,
  direction: Direction = game.facing,
): GameState => {
  if (game.status !== "playing") {
    return game
  }

  const nextFacing: HorizontalDirection =
    direction === "left" || direction === "right" ? direction : game.facing

  if (game.torpedoAmmo <= 0) {
    return withGameMessage(
      {
        ...game,
        facing: nextFacing,
      },
      createLogMessage(() => i18n._("No torpedoes remaining."), "negative"),
    )
  }

  return advanceTurn(
    game,
    game.player,
    nextFacing,
    { kind: "torpedo", direction },
    createLogMessage(
      () =>
        direction === "left"
          ? i18n._("Tube away to port.")
          : direction === "right"
          ? i18n._("Tube away to starboard.")
          : i18n._("VLS launch upward."),
      "neutral",
    ),
  )
}

export const dropDepthCharge = (game: GameState): GameState => {
  if (game.status !== "playing") {
    return game
  }

  if (game.depthChargeAmmo <= 0) {
    return withGameMessage(
      {
        ...game,
      },
      createLogMessage(() => i18n._("No depth charges remaining."), "negative"),
    )
  }

  return advanceTurn(
    game,
    game.player,
    game.facing,
    { kind: "depth-charge" },
    createLogMessage(() => i18n._("Depth charge away."), "neutral"),
  )
}
