/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import {
  createLogMessage,
  createInitialLogs,
  formatGroupedLogMessage,
  groupLogMessages,
  withGameMessage,
} from "./log.ts"
import type { GameState } from "./model.ts"

Deno.test("withGameMessage appends to the history and keeps the latest message", () => {
  const base = createGameStateForLogs()

  const next = withGameMessage(base, createLogMessage("Advance."))

  assertEquals(next.message, "Advance.")
  assertEquals(next.logs, [{ message: "Advance.", type: "neutral" }])
})

Deno.test("groupLogMessages groups consecutive duplicates", () => {
  const grouped = groupLogMessages([
    createLogMessage("Advance."),
    createLogMessage("Advance."),
    createLogMessage("Holding position."),
    createLogMessage("Holding position."),
    createLogMessage("Advance."),
  ]).map(formatGroupedLogMessage)

  assertEquals(grouped, ["Advance. (x2)", "Holding position. (x2)", "Advance."])
})

Deno.test("createInitialLogs seeds the orders panel with mission help", () => {
  assertEquals(createInitialLogs(), [
    createLogMessage(
      "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
    ),
    createLogMessage("Move with WASD or arrows."),
    createLogMessage("Click once to plot a course."),
    createLogMessage("Click the same tile again to engage auto-nav."),
    createLogMessage("Wait with ."),
    createLogMessage("Launch torpedo with Z."),
    createLogMessage("Drop depth charge with X."),
    createLogMessage("Toggle display with M."),
    createLogMessage("Press R for random run."),
  ])
})

Deno.test("groupLogMessages keeps differently typed messages separate", () => {
  const grouped = groupLogMessages([
    createLogMessage("Status changed.", "neutral"),
    createLogMessage("Status changed.", "warning"),
  ])

  assertEquals(grouped, [
    { message: "Status changed.", type: "neutral", count: 1 },
    { message: "Status changed.", type: "warning", count: 1 },
  ])
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
