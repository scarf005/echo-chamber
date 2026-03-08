/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import type { GameState } from "../game/game.ts"
import type { GeneratedMap, Point } from "../game/mapgen.ts"
import { buildVentLightMap } from "./lighting.ts"

Deno.test("buildVentLightMap only lights vent tiles", () => {
  const map = createMapFromRows(
    [
      "#########",
      "#...#...#",
      "#...#...#",
      "#...V...#",
      "#########",
    ],
    { x: 1, y: 3 },
    { x: 7, y: 3 },
  )
  const game = createLightingGame(map)
  const lightMap = buildVentLightMap(game)
  const ventIndex = 3 * map.width + 4
  const plumeIndex = 2 * map.width + 4
  const nearbyIndex = 3 * map.width + 3

  assert(lightMap.has(ventIndex))
  assertEquals(lightMap.has(plumeIndex), false)
  assertEquals(lightMap.has(nearbyIndex), false)
  assertEquals(lightMap.size, 1)
})

function createLightingGame(map: GeneratedMap): GameState {
  return {
    map,
    player: { x: 1, y: 3 },
    seed: "vent-lighting-test",
    turn: 5,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    capsuleCollected: false,
    memory: map.tiles.slice(),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 1 as const),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    playerSonarContactAudioVariant: null,
    hostileSonarContactCueCount: 0,
    playerEntityHitCueCount: 0,
    playerDeathCueCount: 0,
    playerPickupCueCount: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    fish: [],
    hostileSubmarines: [],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 0,
    depthChargeAmmo: 0,
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
    Array.from(
      row,
      (cell) =>
        cell === "#" ? "wall" : cell === "V" ? "vent" : "water" as const,
    )
  )

  return {
    width,
    height,
    tiles,
    spawn,
    capsule,
    seed: "lighting-test-map",
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
