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

Deno.test("falling boulders crush the player instead of only logging impact text", () => {
  const game = createBoulderLandingGame({ player: { x: 3, y: 3 } })

  const next = holdPosition(game)

  assertEquals(next.status, "lost")
  assertEquals(next.fallingBoulders.length, 0)
  assertEquals(next.message, "Cave-in debris crushes your hull. Press R for a new run.")
})

Deno.test("falling boulders crush hostile submarines in their path", () => {
  const game = createBoulderLandingGame({
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 3, y: 3 },
      facing: "left",
      mode: "patrol",
      target: null,
      reload: 0,
    }],
  })

  const next = holdPosition(game)

  assertEquals(next.status, "playing")
  assertEquals(next.hostileSubmarines.length, 0)
  assertEquals(next.message, "Cave-in debris slams through the silt.")
})

function createBoulderLandingGame(overrides: Partial<GameState> = {}): GameState {
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

  const base: GameState = {
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

  return {
    ...base,
    ...overrides,
    map,
    player: overrides.player ? { ...overrides.player } : base.player,
    hostileSubmarines: overrides.hostileSubmarines?.map((hostileSubmarine) => ({
      ...hostileSubmarine,
      position: { ...hostileSubmarine.position },
      target: hostileSubmarine.target ? { ...hostileSubmarine.target } : null,
    })) ?? base.hostileSubmarines,
    fish: overrides.fish?.map((fish) => ({
      ...fish,
      position: { ...fish.position },
      target: fish.target ? { ...fish.target } : null,
    })),
    fallingBoulders: overrides.fallingBoulders?.map((boulder) => ({
      ...boulder,
      position: { ...boulder.position },
    })) ?? base.fallingBoulders,
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
