/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import {
  createGame,
  type Direction,
  type GameState,
  movePlayer,
} from "./game.ts"
import {
  type GeneratedMap,
  isPassableTile,
  type Point,
  tileAt,
} from "./mapgen.ts"

Deno.test("createGame is deterministic for the same seed", () => {
  const first = createGame({ seed: "playable-seed", width: 48, height: 24 })
  const second = createGame({ seed: "playable-seed", width: 48, height: 24 })

  assertEquals(first, second)
})

Deno.test("movePlayer advances into an adjacent passable cell", () => {
  const game = createGame({ seed: "movement-seed", width: 48, height: 24 })
  const direction = findFirstStepDirection(game.map, game.player)

  assert(direction)

  const next = movePlayer(game, direction)

  assertEquals(next.turn, 1)
  assert(next.player.x !== game.player.x || next.player.y !== game.player.y)
})

Deno.test("sonar emits on the third successful move", () => {
  const game = createGame({ seed: "sonar-seed", width: 48, height: 24 })
  const path = findPath(game.map, game.player, game.map.capsule)

  assert(path.length > 3)

  let current = game

  for (let index = 1; index <= 3; index += 1) {
    current = movePlayer(
      current,
      directionBetween(path[index - 1], path[index]),
    )
  }

  assertEquals(current.turn, 3)
  assertEquals(current.lastSonarTurn, 3)
  assertEquals(current.sonarWaves.length > 0, true)
  assertEquals(
    current.sonarFront.includes(
      current.player.y * current.map.width + current.player.x,
    ),
    true,
  )
})

Deno.test("game can be won by following a valid path to the capsule", () => {
  const game = createGame({ seed: "win-seed", width: 48, height: 24 })
  const path = findPath(game.map, game.player, game.map.capsule)

  let current = game

  for (let index = 1; index < path.length; index += 1) {
    current = movePlayer(
      current,
      directionBetween(path[index - 1], path[index]),
    )
  }

  assertEquals(current.status, "won")
  assertEquals(current.player, current.map.capsule)
})

Deno.test("passive visibility uses 1 tile exact and 2 tiles coarse", () => {
  const game = createFlatGame()
  const next = movePlayer(game, "right")
  const exactIndex = next.player.y * next.map.width + (next.player.x + 1)
  const coarseIndex = next.player.y * next.map.width + (next.player.x + 2)
  const darkIndex = next.player.y * next.map.width + (next.player.x + 3)

  assertEquals(next.visibility[exactIndex], 3)
  assertEquals(next.visibility[coarseIndex], 2)
  assertEquals(next.visibility[darkIndex], 0)
})

Deno.test("sonar wave stops at walls and does not reveal behind them", () => {
  const game = createSonarWallGame()
  const emitted = movePlayer(game, "right")
  const propagated = movePlayer(emitted, "right")
  const next = movePlayer(propagated, "right")
  const wallIndex = emitted.player.y * emitted.map.width + 6
  const hiddenIndex = emitted.player.y * emitted.map.width + 7

  assertEquals(next.lastSonarTurn, 3)
  assertEquals(next.memory[wallIndex], "wall")
  assert(next.visibility[wallIndex] > 0)
  assertEquals(next.memory[hiddenIndex], null)
  assertEquals(next.visibility[hiddenIndex], 0)
})

function findFirstStepDirection(
  map: ReturnType<typeof createGame>["map"],
  start: Point,
): Direction | null {
  const directions: Array<{ direction: Direction; point: Point }> = [
    { direction: "up", point: { x: start.x, y: start.y - 1 } },
    { direction: "down", point: { x: start.x, y: start.y + 1 } },
    { direction: "left", point: { x: start.x - 1, y: start.y } },
    { direction: "right", point: { x: start.x + 1, y: start.y } },
  ]

  for (const entry of directions) {
    if (isPassableTile(tileAt(map, entry.point.x, entry.point.y))) {
      return entry.direction
    }
  }

  return null
}

function findPath(
  map: ReturnType<typeof createGame>["map"],
  start: Point,
  end: Point,
): Point[] {
  const queue = [start]
  const parents = new Map<string, Point | null>()
  parents.set(keyOf(start), null)

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    if (current.x === end.x && current.y === end.y) {
      break
    }

    for (const next of neighbors(current)) {
      const key = keyOf(next)

      if (parents.has(key)) {
        continue
      }

      if (isPassableTile(tileAt(map, next.x, next.y))) {
        parents.set(key, current)
        queue.push(next)
      }
    }
  }

  const path: Point[] = []
  let cursor: Point | null = end

  while (cursor) {
    path.push(cursor)
    cursor = parents.get(keyOf(cursor)) ?? null
  }

  path.reverse()
  return path
}

function neighbors(point: Point): Point[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ]
}

function keyOf(point: Point): string {
  return `${point.x}:${point.y}`
}

function directionBetween(from: Point, to: Point): Direction {
  if (to.x > from.x) {
    return "right"
  }

  if (to.x < from.x) {
    return "left"
  }

  if (to.y > from.y) {
    return "down"
  }

  return "up"
}

function createFlatGame(): GameState {
  const map = createMapFromRows(
    [
      "#######",
      "#.....#",
      "#.....#",
      "#.....#",
      "#######",
    ],
    { x: 1, y: 2 },
    { x: 5, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "flat-test",
    turn: 0,
    status: "playing",
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    message: "",
  }
}

function createSonarWallGame(): GameState {
  const map = createMapFromRows(
    [
      "##########",
      "#.....#..#",
      "#.....#..#",
      "#.....#..#",
      "##########",
    ],
    { x: 1, y: 2 },
    { x: 8, y: 2 },
  )

  return {
    map,
    player: { x: 1, y: 2 },
    seed: "sonar-wall-test",
    turn: 2,
    status: "playing",
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    message: "",
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
    Array.from(row, (cell) => (cell === "#" ? "wall" : "water" as const))
  )

  return {
    width,
    height,
    tiles,
    spawn,
    capsule,
    seed: "test-map",
    metadata: {
      mainRouteLength: 0,
      smoothingIterations: 0,
      wallProbability: 0,
      topology: 8,
      openTileRatio: 0,
    },
  }
}
