/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { holdPosition, type GameState } from "./game.ts"
import type { GeneratedMap, Point } from "./mapgen.ts"

Deno.test("falling boulders settle into wall debris when they hit the bottom", () => {
  const game = createBoulderLandingGame()
  const next = holdPosition(game)
  const landingIndex = 3 * next.map.width + 3

  assertEquals(next.fallingBoulders.length, 0)
  assertEquals(next.map.tiles[landingIndex], "wall")
  assertEquals(next.message, "Cave-in debris slams through the silt.")
})

function createBoulderLandingGame(): GameState {
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
    player: { x: 1, y: 1 },
    seed: "boulder-landing-test",
    turn: 0,
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
    fallingBoulders: [{ position: { x: 3, y: 2 }, speed: 2 }],
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
    Array.from(row, (cell) => (cell === "#" ? "wall" : "water" as const))
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
