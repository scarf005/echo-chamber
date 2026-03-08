/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { fireTorpedo, type GameState } from "./game.ts"
import type { Point } from "./mapgen.ts"

Deno.test("player can launch a VLS torpedo upward without changing facing", () => {
  const game = createVlsTorpedoTestGame()
  const next = fireTorpedo(game, "up")
  const impactIndex = next.map.width + 2

  assertEquals(next.turn, 1)
  assertEquals(next.facing, "right")
  assertEquals(next.torpedoAmmo, 5)
  assertEquals(next.map.tiles[impactIndex], "water")
  assert(next.shockwaveFront.some((cell) => cell.index === impactIndex))
  assertEquals(next.torpedoes.length, 0)
  assertEquals(next.message, "loud explosion detected at ↑")
})

function createVlsTorpedoTestGame(): GameState {
  const map = createMapFromRows(
    [
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ],
    { x: 1, y: 3 },
    { x: 3, y: 1 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "vls-torpedo-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    capsuleCollected: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
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
): GameState["map"] {
  const height = rows.length
  const width = rows[0]?.length ?? 0

  return {
    width,
    height,
    tiles: rows.flatMap((row) =>
      Array.from(row, (cell) => cell === "#" ? "wall" as const : "water" as const)
    ),
    spawn,
    capsule,
    seed: "vls-map",
    metadata: {
      mainRouteLength: 0,
      smoothingIterations: 0,
      wallProbability: 0,
      topology: 4,
      openTileRatio: 1,
      biomes: ["regular"],
    },
  }
}
