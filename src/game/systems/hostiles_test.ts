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
