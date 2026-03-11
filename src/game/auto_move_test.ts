/// <reference lib="deno.ns" />

import { assertEquals, assertStrictEquals } from "@std/assert"

import {
  createGame,
  findAutoMoveAnomaly,
  findAutoMovePath,
  keyForAutoMoveAnomaly,
  shouldHaltAutoMoveForAnomaly,
} from "./game.ts"

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
