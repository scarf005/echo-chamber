/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { holdPosition, type GameState } from "./game.ts"
import type { GeneratedMap, Point } from "./mapgen.ts"

Deno.test("sonar keeps hostile and item contacts as fog-of-war markers", () => {
  const game = createSonarEntityMemoryGame()
  const itemIndex = game.map.width * 2 + 5
  let current = holdPosition(game)

  assertEquals(current.lastSonarTurn, 5)

  for (let step = 0; step < 8; step += 1) {
    if (current.entityMemory?.[itemIndex] === "item") {
      break
    }

    current = holdPosition(current)
  }

  assertEquals(current.entityMemory?.[itemIndex], "item")
  current = holdPosition(current)
  assertEquals(current.visibility[itemIndex], 0)
  assertEquals(current.entityMemory?.[itemIndex], "item")

  let hostileIndex = -1

  for (let step = 0; step < 8; step += 1) {
    hostileIndex = current.hostileSubmarines[0].position.y * current.map.width +
      current.hostileSubmarines[0].position.x

    if (current.entityMemory?.[hostileIndex] === "hostile-submarine") {
      break
    }

    current = holdPosition(current)
  }

  assertEquals(current.entityMemory?.[hostileIndex], "hostile-submarine")
  current = holdPosition(current)
  assertEquals(current.visibility[hostileIndex], 0)
  assertEquals(current.entityMemory?.[hostileIndex], "hostile-submarine")
})

function createSonarEntityMemoryGame(): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 2, y: 2 },
    { x: 10, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "sonar-entity-memory-test",
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
    pickups: [{ position: { x: 5, y: 2 }, kind: "map" }],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 9, y: 1 },
      facing: "left",
      mode: "patrol",
      target: null,
      reload: 0,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
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
