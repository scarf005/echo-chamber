/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import type { GameState, HostileSubmarine } from "../../game/game.ts"
import {
  markerForEntityMemory,
  resolveHostileEstimateOverlay,
  resolveHostileEstimatedPlayerPosition,
} from "./entities.ts"

Deno.test("entity memory markers distinguish item enemy and non-hostile", () => {
  assertEquals(markerForEntityMemory("item"), {
    glyph: "?",
    color: "#b7ff8a",
  })
  assertEquals(markerForEntityMemory("enemy"), {
    glyph: "?",
    color: "#ff5d55",
    backgroundColor: "#ffe28a",
  })
  assertEquals(markerForEntityMemory("non-hostile"), {
    glyph: "~",
    color: "#7dff9b",
  })
})

Deno.test("hostile estimate prefers guessed target and falls back to known player fix", () => {
  const withGuess: HostileSubmarine = {
    id: "hostile-1",
    position: { x: 4, y: 4 },
    facing: "left",
    mode: "attack",
    target: null,
    reload: 0,
    lastKnownPlayerPosition: { x: 2, y: 2 },
    debugState: {
      confirmedPlayerPosition: { x: 2, y: 2 },
      cluePosition: null,
      playerVector: null,
      directDetection: false,
      detectedByPlayerSonar: false,
      receivedImmediateRelay: false,
      alertedByCapsuleRecovery: false,
      retainedPlannedPath: false,
      repositioningForSalvo: false,
      movementTarget: null,
      sonarInterval: null,
      emittedSonar: false,
      broadcastPlayerFix: false,
      attack: {
        attackTarget: { x: 2, y: 2 },
        guessedTarget: { x: 3, y: 2 },
        blockedReason: null,
        directLane: false,
        horizontalShotOpportunity: false,
        verticalShotOpportunity: false,
        ceilingTrapDirection: null,
        turnAge: null,
        maxEvidenceAge: null,
        confidence: null,
        avoidFriendlyFire: false,
        firedWeapon: null,
        firedDirection: null,
        salvoShotsRemaining: 0,
        salvoStepDirection: null,
        salvoMoveTarget: null,
      },
    },
  }
  const withFixOnly: HostileSubmarine = {
    ...withGuess,
    id: "hostile-2",
    debugState: {
      ...withGuess.debugState!,
      attack: {
        ...withGuess.debugState!.attack,
        guessedTarget: null,
      },
    },
  }

  assertEquals(resolveHostileEstimatedPlayerPosition(withGuess), { x: 3, y: 2 })
  assertEquals(resolveHostileEstimatedPlayerPosition(withFixOnly), { x: 2, y: 2 })
})

Deno.test("hostile estimate overlay highlights hovered hostile estimate only", () => {
  const game = createEstimateOverlayGame()
  const hoveredOverlay = resolveHostileEstimateOverlay(game, { x: 4, y: 1 })
  const unhoveredOverlay = resolveHostileEstimateOverlay(game, { x: 1, y: 1 })

  assertEquals(hoveredOverlay.estimatedPositions.sort(comparePoints), [
    { x: 3, y: 2 },
    { x: 2, y: 3 },
  ])
  assertEquals(hoveredOverlay.highlightedEstimatedPosition, { x: 3, y: 2 })
  assertEquals(unhoveredOverlay.highlightedEstimatedPosition, null)
})

function comparePoints(left: GameState["player"], right: GameState["player"]): number {
  return left.y - right.y || left.x - right.x
}

function createEstimateOverlayGame(): GameState {
  return {
    map: {
      width: 5,
      height: 5,
      tiles: Array.from({ length: 25 }, () => "water" as const),
      spawn: { x: 0, y: 0 },
      capsule: { x: 4, y: 4 },
      seed: "estimate-overlay-test",
      metadata: {
        mainRouteLength: 0,
        smoothingIterations: 0,
        wallProbability: 0,
        topology: 8,
        openTileRatio: 1,
        biomes: ["regular"],
      },
    },
    player: { x: 1, y: 1 },
    seed: "estimate-overlay-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: 25 }, () => null),
    entityMemory: Array.from({ length: 25 }, () => null),
    visibility: Array.from({ length: 25 }, () => 0 as const),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [
      {
        id: "hostile-1",
        position: { x: 4, y: 1 },
        facing: "left",
        mode: "attack",
        target: null,
        reload: 0,
        lastKnownPlayerPosition: { x: 3, y: 2 },
        debugState: {
          confirmedPlayerPosition: null,
          cluePosition: null,
          playerVector: null,
          directDetection: false,
          detectedByPlayerSonar: false,
          receivedImmediateRelay: false,
          alertedByCapsuleRecovery: false,
          retainedPlannedPath: false,
          repositioningForSalvo: false,
          movementTarget: null,
          sonarInterval: null,
          emittedSonar: false,
          broadcastPlayerFix: false,
          attack: {
            attackTarget: { x: 3, y: 2 },
            guessedTarget: { x: 3, y: 2 },
            blockedReason: null,
            directLane: false,
            horizontalShotOpportunity: false,
            verticalShotOpportunity: false,
            ceilingTrapDirection: null,
            turnAge: null,
            maxEvidenceAge: null,
            confidence: null,
            avoidFriendlyFire: false,
            firedWeapon: null,
            firedDirection: null,
            salvoShotsRemaining: 0,
            salvoStepDirection: null,
            salvoMoveTarget: null,
          },
        },
      },
      {
        id: "hostile-2",
        position: { x: 4, y: 4 },
        facing: "right",
        mode: "investigate",
        target: null,
        reload: 0,
        lastKnownPlayerPosition: { x: 2, y: 3 },
      },
      {
        id: "hostile-3",
        position: { x: 0, y: 4 },
        facing: "right",
        mode: "investigate",
        target: null,
        reload: 0,
        lastKnownPlayerPosition: { x: 9, y: 9 },
      },
    ],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: 25 }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 0,
    depthChargeAmmo: 0,
    screenShake: 0,
    message: "",
    logs: [],
  }
}
