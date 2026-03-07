/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import {
  createGame,
  findAutoMovePath,
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

Deno.test("auto-move only halts once for a seen reason", () => {
  const seenReasons = new Set<string>()
  const anomaly = {
    point: { x: 4, y: 2 },
    reason: "torpedo cache in sight",
  }

  assertEquals(shouldHaltAutoMoveForAnomaly(seenReasons, anomaly), true)
  seenReasons.add(anomaly.reason)
  assertEquals(shouldHaltAutoMoveForAnomaly(seenReasons, anomaly), false)
  assertEquals(
    shouldHaltAutoMoveForAnomaly(seenReasons, {
      point: anomaly.point,
      reason: "survey map in sight",
    }),
    true,
  )
})
