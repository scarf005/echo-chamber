/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { holdPosition, type GameState } from "./game.ts"
import type { GeneratedMap, Point } from "./mapgen.ts"

Deno.test("sonar stops when it hits bubble trails", () => {
  const game = createBubbleBlockingSonarGame()
  const emitted = holdPosition(game)
  const bubbleIndex = emitted.player.y * emitted.map.width + 4
  const hiddenIndex = emitted.player.y * emitted.map.width + 5

  assertEquals(emitted.lastSonarTurn, 5)
  assert(emitted.shockwaveFront.some((cell) => cell.index === bubbleIndex))

  const next = holdPosition(emitted)

  assertEquals(next.memory[hiddenIndex], null)
  assertEquals(next.visibility[hiddenIndex], 0)
})

Deno.test("sonar stops when it hits kelp", () => {
  const game = createKelpBlockingSonarGame()
  const emitted = holdPosition(game)
  const kelpIndex = emitted.player.y * emitted.map.width + 4
  const hiddenIndex = emitted.player.y * emitted.map.width + 5

  assertEquals(emitted.lastSonarTurn, 5)
  assert(emitted.shockwaveFront.some((cell) => cell.index === kelpIndex))

  const next = holdPosition(emitted)

  assertEquals(next.memory[kelpIndex], "kelp")
  assertEquals(next.visibility[kelpIndex] > 0, true)
  assertEquals(next.memory[hiddenIndex], null)
  assertEquals(next.visibility[hiddenIndex], 0)
})

function createBubbleBlockingSonarGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "#......#",
      "########",
    ],
    { x: 1, y: 2 },
    { x: 6, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "bubble-sonar-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [],
    trails: [{ index: 2 * map.width + 4, alpha: 1 }],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createKelpBlockingSonarGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#...K..#",
      "#......#",
      "########",
    ],
    { x: 1, y: 2 },
    { x: 6, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "kelp-sonar-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createMapFromRows(
  rows: string[],
  spawn: Point,
  capsule: Point,
): GeneratedMap {
  const width = rows[0].length
  const height = rows.length
  const tiles = rows.flatMap((row) =>
    Array.from(row, (cell) =>
      cell === "#" ? "wall" : cell === "K" ? "kelp" : "water" as const
    )
  )

  return {
    width,
    height,
    tiles,
    spawn,
    capsule,
    seed: "test-map",
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
