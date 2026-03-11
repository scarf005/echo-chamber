/// <reference lib="deno.ns" />

import { assertEquals, assertStrictEquals } from "@std/assert"

import {
  createGame,
  findAutoMoveAnomaly,
  findAutoMovePath,
  keyForAutoMoveAnomaly,
  shouldHaltAutoMoveForAnomaly,
  shouldIgnoreAutoMovePickupAnomalyOnPath,
} from "./game.ts"
import type { GeneratedMap, Point } from "./mapgen.ts"
import type { GameState } from "./model.ts"

Deno.test("auto-move pathfinding stops once the run is over", () => {
  const game = createGame({
    seed: "auto-move-status-test",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })
  const destination = { ...game.player }

  assertEquals(findAutoMovePath(game, destination), [destination])
  assertEquals(findAutoMovePath({ ...game, status: "lost" }, destination), [])
  assertEquals(findAutoMovePath({ ...game, status: "won" }, destination), [])
})

Deno.test("auto-move pathfinding reuses cached results for the same game state", () => {
  const game = createGame({
    seed: "auto-move-cache-test",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })
  const destination = { x: game.player.x + 3, y: game.player.y }

  const firstPath = findAutoMovePath(game, destination)
  const secondPath = findAutoMovePath(game, destination)

  assertStrictEquals(secondPath, firstPath)
})

Deno.test("auto-move only halts once for a seen reason", () => {
  const seenAnomalies = new Set<string>()
  const anomaly = {
    point: { x: 4, y: 2 },
    reason: "torpedo cache in sight",
  }

  assertEquals(shouldHaltAutoMoveForAnomaly(seenAnomalies, anomaly), true)
  seenAnomalies.add(keyForAutoMoveAnomaly(anomaly))
  assertEquals(shouldHaltAutoMoveForAnomaly(seenAnomalies, anomaly), false)
  assertEquals(
    shouldHaltAutoMoveForAnomaly(seenAnomalies, {
      point: anomaly.point,
      reason: "survey map in sight",
    }),
    true,
  )
})

Deno.test("auto-move anomaly cache distinguishes matching reasons by location", () => {
  const seenAnomalies = new Set<string>()
  const anomaly = {
    point: { x: 4, y: 2 },
    reason: "torpedo cache in sight",
  }

  seenAnomalies.add(keyForAutoMoveAnomaly(anomaly))

  assertEquals(shouldHaltAutoMoveForAnomaly(seenAnomalies, anomaly), false)
  assertEquals(
    shouldHaltAutoMoveForAnomaly(seenAnomalies, {
      point: { x: 5, y: 2 },
      reason: anomaly.reason,
    }),
    true,
  )
})

Deno.test("auto-move halts for hostile sonar contacts even with player sonar off", () => {
  const game = createGame({
    seed: "auto-move-hostile-sonar-test",
    width: 16,
    height: 10,
    hostileSubmarineCount: 0,
  })
  const contactPoint = { x: game.player.x + 4, y: game.player.y }
  const contactIndex = contactPoint.y * game.map.width + contactPoint.x
  const next = {
    ...game,
    playerSonarEnabled: false,
    visibility: game.visibility.map((level, index) =>
      index === contactIndex ? 1 : level
    ),
    entityMemory: (game.entityMemory ?? []).map((entry, index) =>
      index === contactIndex ? "enemy" : entry
    ),
  }

  assertEquals(findAutoMoveAnomaly(next), {
    point: contactPoint,
    reason: "sonar",
  })
})

Deno.test("auto-move ignores item anomalies on the plotted route", () => {
  const game = createFlatAutoMoveGame()
  const destination = { x: 4, y: 2 }
  const path = findAutoMovePath(game, destination)
  const destinationIndex = destination.y * game.map.width + destination.x
  const sonarTargetGame = {
    ...game,
    visibility: game.visibility.map((level, index) =>
      index === destinationIndex ? 2 : level
    ),
    entityMemory: (game.entityMemory ?? []).map((entry, index) =>
      index === destinationIndex ? "item" : entry
    ),
    pickups: [{ position: destination, kind: "torpedo-cache" as const }],
  }
  const sonarAnomaly = findAutoMoveAnomaly(sonarTargetGame)

  assertEquals(sonarAnomaly, {
    point: destination,
    reason: "sonar",
  })
  assertEquals(
    shouldIgnoreAutoMovePickupAnomalyOnPath(
      sonarTargetGame,
      path,
      sonarAnomaly,
    ),
    true,
  )

  const exactTargetGame = {
    ...sonarTargetGame,
    visibility: sonarTargetGame.visibility.map((level, index) =>
      index === destinationIndex ? 3 : level
    ),
  }
  const exactAnomaly = findAutoMoveAnomaly(exactTargetGame)

  assertEquals(exactAnomaly, {
    point: destination,
    reason: "torpedo cache in sight",
  })
  assertEquals(
    shouldIgnoreAutoMovePickupAnomalyOnPath(
      exactTargetGame,
      path,
      exactAnomaly,
    ),
    true,
  )
})

Deno.test("auto-move still halts for non-item anomalies on the route", () => {
  const game = createFlatAutoMoveGame()
  const destination = { x: 4, y: 2 }
  const path = findAutoMovePath(game, destination)
  const destinationIndex = destination.y * game.map.width + destination.x
  const hostileTargetGame = {
    ...game,
    visibility: game.visibility.map((level, index) =>
      index === destinationIndex ? 1 : level
    ),
    entityMemory: (game.entityMemory ?? []).map((entry, index) =>
      index === destinationIndex ? "enemy" : entry
    ),
  }
  const anomaly = findAutoMoveAnomaly(hostileTargetGame)

  assertEquals(anomaly, {
    point: destination,
    reason: "sonar",
  })
  assertEquals(
    shouldIgnoreAutoMovePickupAnomalyOnPath(
      hostileTargetGame,
      path,
      anomaly,
    ),
    false,
  )
})

Deno.test("auto-move still halts for item anomalies off the plotted route", () => {
  const game = createFlatAutoMoveGame()
  const destination = { x: 4, y: 2 }
  const offRoutePickup = { x: 2, y: 1 }
  const path = findAutoMovePath(game, destination)
  const pickupIndex = offRoutePickup.y * game.map.width + offRoutePickup.x
  const next = {
    ...game,
    visibility: game.visibility.map((level, index) =>
      index === pickupIndex ? 3 : level
    ),
    pickups: [{ position: offRoutePickup, kind: "map" as const }],
  }
  const anomaly = findAutoMoveAnomaly(next)

  assertEquals(anomaly, {
    point: offRoutePickup,
    reason: "survey map in sight",
  })
  assertEquals(
    shouldIgnoreAutoMovePickupAnomalyOnPath(next, path, anomaly),
    false,
  )
})

const createFlatAutoMoveGame = (): GameState => {
  const map = createMapFromRows(
    [
      "#######",
      "#.....#",
      "#.....#",
      "#.....#",
      "#######",
    ],
    { x: 1, y: 2 },
    { x: 5, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "auto-move-flat-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    capsuleCollected: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    playerSonarContactAudioVariant: null,
    hostileSonarContactCueCount: 0,
    playerEntityHitCueCount: 0,
    playerDeathCueCount: 0,
    playerPickupCueCount: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    fish: [],
    hostileSubmarines: [],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

const createMapFromRows = (
  rows: string[],
  spawn: Point,
  capsule: Point,
): GeneratedMap => {
  const width = rows[0].length
  const height = rows.length
  const tiles = rows.flatMap((row) =>
    Array.from(row, (cell) => (cell === "#" ? "wall" : "water" as const))
  )

  return {
    width,
    height,
    tiles,
    spawn,
    capsule,
    seed: "auto-move-test-map",
    metadata: {
      mainRouteLength: 0,
      smoothingIterations: 0,
      wallProbability: 0,
      topology: 8,
      openTileRatio: 0,
      biomes: ["regular"],
    },
  }
}
