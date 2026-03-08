/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { type GameState, revealMap } from "./game.ts"
import type { GeneratedMap, Point } from "./mapgen.ts"

Deno.test("revealMap remembers the full terrain layout as fog-of-war", () => {
  const game = createPerceptionTestGame()
  const revealed = revealMap(game)

  assertEquals(revealed.capsuleKnown, true)
  assert(revealed.memory.every((tile) => tile !== null))
  assert(revealed.visibility.every((level) => level === 1))
  assertEquals(revealed.memory, game.map.tiles)
  assertEquals(revealed.entityMemory, game.entityMemory)
  assertEquals(game.memory.some((tile) => tile === null), true)
})

function createPerceptionTestGame(): GameState {
  const map = createMapFromRows(
    [
      "#####",
      "#...#",
      "#...#",
      "#####",
    ],
    { x: 1, y: 1 },
    { x: 3, y: 2 },
  )

  return {
    map,
    player: { x: 1, y: 1 },
    seed: "reveal-map-test",
    turn: 0,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
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
