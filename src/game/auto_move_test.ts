/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { createGame, findAutoMovePath } from "./game.ts"

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
