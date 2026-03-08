/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { activateLocale, defaultLocale, i18n } from "../i18n.ts"
import {
  createInitialLogs,
  createLogMessage,
  formatGroupedLogMessage,
  groupLogMessages,
  groupVisibleLogMessages,
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
    createLogMessage("Launch torpedo upwards with C."),
    createLogMessage("Drop depth charge with X."),
    createLogMessage("Toggle display with M."),
    createLogMessage(
      "When sunk, press R to restart. Use Options for restart or random run anytime.",
    ),
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

Deno.test("groupVisibleLogMessages ignores hidden AI entries before grouping", () => {
  const grouped = groupVisibleLogMessages([
    createLogMessage("Advance."),
    createLogMessage("Scout slips north.", "ai"),
    createLogMessage("Advance."),
    createLogMessage("Scout slips north.", "ai"),
    createLogMessage("Advance."),
  ]).map(formatGroupedLogMessage)

  assertEquals(grouped, ["Advance. (x3)"])
})

Deno.test("groupVisibleLogMessages keeps AI entries visible in god mode", () => {
  const grouped = groupVisibleLogMessages([
    createLogMessage("Advance."),
    createLogMessage("Scout slips north.", "ai"),
    createLogMessage("Advance."),
  ], true).map(formatGroupedLogMessage)

  assertEquals(grouped, ["Advance.", "Scout slips north.", "Advance."])
})

Deno.test("formatGroupedLogMessage re-translates existing messages after locale changes", () => {
  activateLocale("en")

  try {
    const localizedEntry = createLogMessage(
      i18n._("Holding position."),
      "neutral",
      () => i18n._("Holding position."),
    )
    const [groupedEntry] = groupLogMessages([localizedEntry])

    assertEquals(formatGroupedLogMessage(groupedEntry), "Holding position.")

    activateLocale("ko")

    assertEquals(formatGroupedLogMessage(groupedEntry), "위치 유지.")
  } finally {
    activateLocale(defaultLocale)
  }
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
