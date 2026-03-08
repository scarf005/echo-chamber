/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { stepHostileSubmarines } from "./hostiles.ts"
import type { HostileSubmarine } from "../model.ts"
import type { GeneratedMap, Point } from "../mapgen.ts"

Deno.test("hostile step emits notable ai decisions", () => {
  const map = createMapFromRows(
    [
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "##########",
    ],
    { x: 1, y: 2 },
    { x: 8, y: 2 },
  )
  const hostile: HostileSubmarine = {
    id: "hostile-1",
    position: { x: 7, y: 2 },
    facing: "left",
    mode: "patrol",
    target: null,
    reload: 0,
    archetype: "hunter",
    initialPosition: { x: 7, y: 2 },
    torpedoAmmo: 6,
    vlsAmmo: 6,
    depthChargeAmmo: 6,
    lastSonarTurn: 0,
    lastKnownPlayerPosition: null,
    lastKnownPlayerVector: null,
    lastKnownPlayerTurn: null,
    plannedPath: [],
    lastAiLog: null,
  }

  const next = stepHostileSubmarines(
    map,
    [hostile],
    {
      player: { x: 3, y: 2 },
      previousPlayer: { x: 3, y: 2 },
      shockwaves: [],
      trails: [],
      memory: Array.from({ length: map.tiles.length }, () => null),
      playerSonarHitHostiles: new Set(),
      capsuleRetrievedThisTurn: false,
    },
    "hostile-ai-log-test",
    1,
  )

  assertEquals(next.aiDecisionLogs, ["hostile-1: will attack 3,2"])
  assertEquals(next.hostileSubmarines[0].lastAiLog, "hostile-1: will attack 3,2")
})

Deno.test("hostile step suppresses duplicate ai decisions on unchanged objective", () => {
  const map = createMapFromRows(
    [
      "##########",
      "#........#",
      "#........#",
      "##########",
    ],
    { x: 1, y: 2 },
    { x: 8, y: 2 },
  )
  const hostile: HostileSubmarine = {
    id: "hostile-1",
    position: { x: 7, y: 2 },
    facing: "left",
    mode: "patrol",
    target: null,
    reload: 0,
    archetype: "hunter",
    initialPosition: { x: 7, y: 2 },
    torpedoAmmo: 6,
    vlsAmmo: 6,
    depthChargeAmmo: 6,
    lastSonarTurn: 0,
    lastKnownPlayerPosition: null,
    lastKnownPlayerVector: null,
    lastKnownPlayerTurn: null,
    plannedPath: [],
    lastAiLog: null,
  }
  const context = {
    player: { x: 3, y: 2 },
    previousPlayer: { x: 3, y: 2 },
    shockwaves: [],
    trails: [],
    memory: Array.from({ length: map.tiles.length }, () => null),
    playerSonarHitHostiles: new Set<string>(),
    capsuleRetrievedThisTurn: false,
  }

  const first = stepHostileSubmarines(
    map,
    [hostile],
    context,
    "hostile-ai-log-test",
    1,
  )
  const second = stepHostileSubmarines(
    map,
    first.hostileSubmarines,
    context,
    "hostile-ai-log-test",
    2,
  )

  assertEquals(first.aiDecisionLogs, ["hostile-1: will attack 3,2"])
  assertEquals(second.aiDecisionLogs, [])
  assertEquals(second.hostileSubmarines[0].lastAiLog, "hostile-1: will attack 3,2")
})

Deno.test("hostiles carry their planned path forward after moving", () => {
  const map = createMapFromRows(
    [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    { x: 1, y: 1 },
    { x: 18, y: 3 },
  )
  const hostile: HostileSubmarine = {
    id: "hostile-1",
    position: { x: 15, y: 2 },
    facing: "left",
    mode: "investigate",
    target: { x: 11, y: 2 },
    reload: 2,
    archetype: "hunter",
    initialPosition: { x: 15, y: 2 },
    torpedoAmmo: 6,
    vlsAmmo: 6,
    depthChargeAmmo: 6,
    lastSonarTurn: 0,
    lastKnownPlayerPosition: null,
    lastKnownPlayerVector: null,
    lastKnownPlayerTurn: null,
    previousPosition: null,
    plannedPath: [
      { x: 15, y: 2 },
      { x: 14, y: 2 },
      { x: 13, y: 2 },
      { x: 12, y: 2 },
      { x: 11, y: 2 },
    ],
    lastAiLog: null,
  }

  const next = stepHostileSubmarines(
    map,
    [hostile],
    {
      player: { x: 1, y: 1 },
      previousPlayer: { x: 1, y: 1 },
      shockwaves: [],
      trails: [],
      memory: Array.from({ length: map.tiles.length }, () => "water"),
      playerSonarHitHostiles: new Set(),
      capsuleRetrievedThisTurn: false,
    },
    "hostile-planned-path-test",
    1,
  )

  assertEquals(next.hostileSubmarines[0].position, { x: 14, y: 2 })
  assertEquals(next.hostileSubmarines[0].target, { x: 11, y: 2 })
  assertEquals(next.hostileSubmarines[0].plannedPath, [
    { x: 14, y: 2 },
    { x: 13, y: 2 },
    { x: 12, y: 2 },
    { x: 11, y: 2 },
  ])
  assertEquals(next.hostileSubmarines[0].recentPositions, [{ x: 15, y: 2 }])
})

Deno.test("scout retreat penalizes recently visited tiles", () => {
  const map = createMapFromRows(
    [
      "###########",
      "#.........#",
      "#.........#",
      "#.........#",
      "#.........#",
      "###########",
    ],
    { x: 1, y: 3 },
    { x: 9, y: 3 },
  )
  const scout: HostileSubmarine = {
    id: "hostile-1",
    position: { x: 5, y: 2 },
    facing: "left",
    mode: "retreat",
    target: { x: 1, y: 1 },
    reload: 0,
    archetype: "scout",
    initialPosition: { x: 5, y: 2 },
    torpedoAmmo: 0,
    vlsAmmo: 0,
    depthChargeAmmo: 0,
    lastSonarTurn: 0,
    lastKnownPlayerPosition: { x: 3, y: 4 },
    lastKnownPlayerVector: null,
    lastKnownPlayerTurn: 1,
    previousPosition: { x: 5, y: 1 },
    recentPositions: [{ x: 5, y: 1 }, { x: 5, y: 2 }],
    plannedPath: [],
    lastAiLog: null,
  }
  const relay: HostileSubmarine = {
    id: "hostile-2",
    position: { x: 1, y: 1 },
    facing: "left",
    mode: "patrol",
    target: null,
    reload: 0,
    archetype: "hunter",
    initialPosition: { x: 1, y: 1 },
    torpedoAmmo: 6,
    vlsAmmo: 6,
    depthChargeAmmo: 6,
    lastSonarTurn: 0,
    lastKnownPlayerPosition: null,
    lastKnownPlayerVector: null,
    lastKnownPlayerTurn: null,
    previousPosition: null,
    recentPositions: [],
    plannedPath: [],
    lastAiLog: null,
  }

  const next = stepHostileSubmarines(
    map,
    [scout, relay],
    {
      player: { x: 3, y: 4 },
      previousPlayer: { x: 3, y: 4 },
      shockwaves: [],
      trails: [],
      memory: Array.from({ length: map.tiles.length }, () => "water"),
      playerSonarHitHostiles: new Set(),
      capsuleRetrievedThisTurn: false,
    },
    "scout-retreat-memory-test",
    2,
  )

  assertEquals(next.hostileSubmarines[0].position, { x: 6, y: 2 })
})

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
    seed: "hostiles-test-map",
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
