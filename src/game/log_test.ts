/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import {
  classifyLogMessageTone,
  createInitialLogs,
  formatGroupedLogMessage,
  groupLogMessages,
  withGameMessage,
} from "./log.ts"
import type { GameState } from "./model.ts"

Deno.test("withGameMessage appends to the history and keeps the latest message", () => {
  const base = createGameStateForLogs()

  const next = withGameMessage(base, "Advance.")

  assertEquals(next.message, "Advance.")
  assertEquals(next.logs, ["Advance."])
})

Deno.test("groupLogMessages groups consecutive duplicates", () => {
  const grouped = groupLogMessages([
    "Advance.",
    "Advance.",
    "Holding position.",
    "Holding position.",
    "Advance.",
  ]).map(formatGroupedLogMessage)

  assertEquals(grouped, ["Advance. (x2)", "Holding position. (x2)", "Advance."])
})

Deno.test("createInitialLogs seeds the orders panel with mission help", () => {
  assertEquals(createInitialLogs(), [
    "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
    "Move with WASD or arrows.",
    "Click once to plot a course.",
    "Click the same tile again to engage auto-nav.",
    "Wait with .",
    "Launch torpedo with Z.",
    "Drop depth charge with X.",
    "Toggle display with M.",
    "Press R for random run.",
  ])
})

Deno.test("classifyLogMessageTone marks positive and negative status messages", () => {
  assertEquals(classifyLogMessageTone("Recovered 3 torpedoes."), "positive")
  assertEquals(classifyLogMessageTone("sonar contact"), "warning")
  assertEquals(
    classifyLogMessageTone("Capsule delivered to dock. Press R for a new run."),
    "positive",
  )
  assertEquals(
    classifyLogMessageTone("Cave-in debris slams through the silt."),
    "negative",
  )
  assertEquals(
    classifyLogMessageTone("A hostile torpedo tears through your hull. Press R for a new run."),
    "negative",
  )
  assertEquals(classifyLogMessageTone("Holding position."), "neutral")
})

function createGameStateForLogs(): GameState {
  return {
    map: {
      width: 1,
      height: 1,
      tiles: ["water"],
      spawn: { x: 0, y: 0 },
      capsule: { x: 0, y: 0 },
      seed: "log-test",
      metadata: {
        mainRouteLength: 0,
        smoothingIterations: 0,
        wallProbability: 0,
        topology: 4,
        openTileRatio: 1,
        biomes: ["regular"],
      },
    },
    player: { x: 0, y: 0 },
    seed: "log-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: [null],
    entityMemory: [null],
    visibility: [0],
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
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 0,
    depthChargeAmmo: 0,
    screenShake: 0,
    message: "",
    logs: [],
  }
}
