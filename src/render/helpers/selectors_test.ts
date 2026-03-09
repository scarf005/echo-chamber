/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import type { GameState } from "../../game/game.ts"
import { wallGlyphForMask } from "./selectors.ts"

Deno.test("wallGlyphForMask renders a stalactite tip with a down triangle", () => {
  const game = createWallGlyphGame([
    ".....",
    "..#..",
    "..#..",
    ".....",
    ".....",
  ])

  assertEquals(wallGlyphForMask({ game, x: 2, y: 2 }), "▼")
})

Deno.test("wallGlyphForMask renders a stalagmite tip with an up triangle", () => {
  const game = createWallGlyphGame([
    ".....",
    ".....",
    "..#..",
    "..#..",
    ".....",
  ])

  assertEquals(wallGlyphForMask({ game, x: 2, y: 2 }), "▲")
})

const createWallGlyphGame = (rows: string[]): GameState => {
  const width = rows[0].length
  const height = rows.length
  const memory = rows.flatMap((row) =>
    Array.from(row, (cell) => (cell === "#" ? "wall" : "water" as const))
  )

  return {
    map: {
      width,
      height,
      tiles: Array.from({ length: width * height }, () => "water" as const),
      spawn: { x: 0, y: 0 },
      capsule: { x: width - 1, y: height - 1 },
      seed: "selectors-test",
      metadata: {
        mainRouteLength: 0,
        smoothingIterations: 0,
        wallProbability: 0,
        topology: 8,
        openTileRatio: 1,
        biomes: ["regular"],
      },
    },
    player: { x: 0, y: 0 },
    seed: "selectors-test",
    turn: 0,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    capsuleCollected: false,
    memory,
    entityMemory: Array.from({ length: width * height }, () => null),
    visibility: Array.from({ length: width * height }, () => 0 as const),
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
    structuralDamage: Array.from({ length: width * height }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 0,
    depthChargeAmmo: 0,
    screenShake: 0,
    message: "",
    logs: [],
  }
}
