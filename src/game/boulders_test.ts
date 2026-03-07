/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { type GameState, holdPosition } from "./game.ts"
import type { GeneratedMap, Point } from "./mapgen.ts"

Deno.test("falling boulders settle into wall debris when they hit the bottom", () => {
  const game = createBoulderLandingGame()
  const next = holdPosition(game)
  const landingIndex = 3 * next.map.width + 3

  assertEquals(next.fallingBoulders.length, 0)
  assertEquals(next.map.tiles[landingIndex], "wall")
  assertEquals(next.message, "Cave-in debris slams through the silt.")
})

Deno.test("falling boulders send bubbles upward until they hit a wall", () => {
  const game = createBoulderLandingGame()
  const landed = holdPosition(game)

  assert(landed.trails.some((cell) => cell.index === 2 * landed.map.width + 3))
  assert(landed.trails.some((cell) => cell.index === 3 * landed.map.width + 3))

  const floated = holdPosition(landed)

  assertEquals(
    floated.trails.some((cell) => cell.index === 3 * floated.map.width + 3),
    false,
  )
  assert(floated.trails.some((cell) => cell.index === floated.map.width + 3))
  assert(
    floated.trails.some((cell) => cell.index === 2 * floated.map.width + 3),
  )

  const blocked = holdPosition(floated)

  assertEquals(blocked.trails.length, 1)
  assert(blocked.trails.some((cell) => cell.index === blocked.map.width + 3))

  const cleared = holdPosition(blocked)

  assertEquals(
    cleared.trails.some((cell) => cell.index === cleared.map.width + 3),
    false,
  )
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
