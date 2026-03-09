/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import { type GameState, holdPosition } from "./game.ts"
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

    if (current.entityMemory?.[hostileIndex] === "enemy") {
      break
    }

    current = holdPosition(current)
  }

  assertEquals(current.entityMemory?.[hostileIndex], "enemy")
  current = holdPosition(current)
  assertEquals(current.visibility[hostileIndex], 0)
  assertEquals(current.entityMemory?.[hostileIndex], "enemy")
})

Deno.test("sonar only identifies enemy and item contacts inside ten tiles", () => {
  const game = createSonarIdentificationRangeGame()
  const nearItemIndex = game.map.width * 2 + 8
  const farItemIndex = game.map.width * 2 + 12

  let current = holdPosition(game)
  let hostileIndex =
    current.hostileSubmarines[0].position.y * current.map.width +
    current.hostileSubmarines[0].position.x

  for (let step = 0; step < 8; step += 1) {
    hostileIndex = current.hostileSubmarines[0].position.y * current.map.width +
      current.hostileSubmarines[0].position.x

    if (
      current.entityMemory?.[nearItemIndex] === "item" &&
      current.entityMemory?.[hostileIndex] === "enemy"
    ) {
      break
    }

    current = holdPosition(current)
  }

  assertEquals(current.entityMemory?.[nearItemIndex], "item")
  assertEquals(current.entityMemory?.[hostileIndex], "enemy")
  assertEquals(current.entityMemory?.[farItemIndex], null)
})

Deno.test("passive detection radius distinguishes fish as non-hostile", () => {
  const game = createPassiveFishIdentificationGame()
  const fishIndex = game.map.width * 2 + 4

  const next = holdPosition(game)

  assertEquals(next.visibility[fishIndex], 2)
  assertEquals(next.entityMemory?.[fishIndex], "non-hostile")
})

const createSonarEntityMemoryGame = (): GameState => {
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
      position: { x: 7, y: 1 },
      initialPosition: { x: 7, y: 1 },
      facing: "left",
      mode: "patrol",
      target: null,
      reload: 0,
      archetype: "turtle",
      torpedoAmmo: 4,
      vlsAmmo: 4,
      depthChargeAmmo: 4,
      lastSonarTurn: 0,
      lastKnownPlayerPosition: null,
      lastKnownPlayerVector: null,
      lastKnownPlayerTurn: null,
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
    logs: [],
  }
}

const createSonarIdentificationRangeGame = (): GameState => {
  const map = createMapFromRows(
    [
      "################",
      "#..............#",
      "#..............#",
      "#..............#",
      "################",
    ],
    { x: 2, y: 2 },
    { x: 14, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "sonar-identify-range-test",
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
    pickups: [
      { position: { x: 8, y: 2 }, kind: "map" },
      { position: { x: 12, y: 2 }, kind: "torpedo-cache" },
    ],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 7, y: 1 },
      initialPosition: { x: 7, y: 1 },
      facing: "left",
      mode: "patrol",
      target: null,
      reload: 0,
      archetype: "turtle",
      torpedoAmmo: 4,
      vlsAmmo: 4,
      depthChargeAmmo: 4,
      lastSonarTurn: 0,
      lastKnownPlayerPosition: null,
      lastKnownPlayerVector: null,
      lastKnownPlayerTurn: null,
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
    logs: [],
  }
}

const createPassiveFishIdentificationGame = (): GameState => {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "#......#",
      "########",
    ],
    { x: 2, y: 2 },
    { x: 6, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "passive-fish-identification-test",
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
    fish: [{
      id: "fish-1",
      position: { x: 4, y: 2 },
      facing: "right",
      mode: "idle",
      target: null,
      idleTurnsRemaining: 2,
      travelTurnsRemaining: 0,
    }],
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
