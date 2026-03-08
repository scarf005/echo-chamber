/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import type { GameState } from "../../game/game.ts"
import { shouldDrawTrail, shouldDrawVentLight } from "./effects.ts"

Deno.test("shouldDrawVentLight hides dynamic vent lighting outside visibility", () => {
  const game = createEffectsGame([0, 1])

  assertEquals(shouldDrawVentLight(game, 0), false)
  assertEquals(shouldDrawVentLight(game, 1), true)
})

Deno.test("shouldDrawTrail keeps player projectile trails visible in darkness", () => {
  const game = createEffectsGame([0, 1])

  assertEquals(shouldDrawTrail(game, 0, { index: 0, alpha: 1 }), false)
  assertEquals(
    shouldDrawTrail(game, 0, { index: 0, alpha: 1, visibleToPlayer: true }),
    true,
  )
  assertEquals(shouldDrawTrail(game, 1, { index: 1, alpha: 1 }), true)
})

function createEffectsGame(visibility: GameState["visibility"]): GameState {
  return {
    map: {
      width: 2,
      height: 1,
      tiles: ["vent", "water"],
      spawn: { x: 0, y: 0 },
      capsule: { x: 1, y: 0 },
      seed: "effects-test",
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
    seed: "effects-test",
    turn: 0,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    capsuleCollected: false,
    memory: ["vent", "water"],
    entityMemory: [null, null],
    visibility,
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
    structuralDamage: [0, 0],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 0,
    depthChargeAmmo: 0,
    screenShake: 0,
    message: "",
    logs: [],
  }
}
