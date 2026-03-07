/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import {
  createGame,
  type Direction,
  dropDepthCharge,
  fireTorpedo,
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

Deno.test("moving submarines leave bubble trails at their previous position", () => {
  const game = createFlatGame()
  const next = movePlayer(game, "right")
  const trailIndex = game.player.y * game.map.width + game.player.x

  assert(next.trails.some((cell) => cell.index === trailIndex && cell.alpha >= 0.68))
})

Deno.test("sonar emits on the fifth successful move", () => {
  const game = createGame({ seed: "sonar-seed", width: 48, height: 24 })
  const path = findPath(game.map, game.player, game.map.capsule)

  assert(path.length > 5)

  let current = game

  for (let index = 1; index <= 5; index += 1) {
    current = movePlayer(
      current,
      directionBetween(path[index - 1], path[index]),
    )
  }

  assertEquals(current.turn, 5)
  assertEquals(current.lastSonarTurn, 5)
  assertEquals(current.sonarWaves.length > 0, true)
  assertEquals(
    current.sonarFront.some((cell) =>
      cell.index === current.player.y * current.map.width + current.player.x
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

  assertEquals(emitted.lastSonarTurn, 5)
  assertEquals(next.memory[wallIndex], "wall")
  assert(next.visibility[wallIndex] > 0)
  assertEquals(next.memory[hiddenIndex], null)
  assertEquals(next.visibility[hiddenIndex], 0)
})

Deno.test("fireTorpedo uses facing, deforms walls, and emits a shockwave", () => {
  const game = createTorpedoTestGame()
  const next = fireTorpedo(game)
  const impactIndex = next.player.y * next.map.width + 5

  assertEquals(next.turn, 1)
  assertEquals(next.torpedoesRemaining, 5)
  assertEquals(next.map.tiles[impactIndex], "water")
  assert(next.trails.length > 0)
  assert(next.sonarFront.some((cell) => cell.index === impactIndex))
  assert(next.screenShake > 0)
  assertEquals(next.torpedoes.length, 0)
})

Deno.test("fireTorpedo also follows left-facing launch direction", () => {
  const game = createLeftTorpedoTestGame()
  const next = fireTorpedo(game)
  const impactIndex = next.player.y * next.map.width + 2

  assertEquals(next.turn, 1)
  assertEquals(next.torpedoesRemaining, 5)
  assertEquals(next.map.tiles[impactIndex], "water")
  assert(next.trails.length > 0)
  assertEquals(next.torpedoes.length, 0)
})

Deno.test("violent torpedoes crack walls into cave-ins with falling boulders", () => {
  const game = createCaveInTestGame()
  const next = fireTorpedo(game, "right")
  const remoteChunkIndex = 2 * next.map.width + 12

  assert(next.cracks.length > 0)
  assert(next.fallingBoulders.length > 0)
  assert(next.dust.length > 0)
  assertEquals(next.map.tiles[remoteChunkIndex], "wall")
  assert(next.screenShake > 0)
})

Deno.test("large detached wall chunks stay put when 36 or more tiles remain", () => {
  const game = createLargeDetachedChunkGame()
  const next = fireTorpedo(game, "right")
  const deepChunkIndex = 4 * next.map.width + 10

  assert(next.cracks.length > 0)
  assertEquals(next.fallingBoulders.length, 0)
  assertEquals(next.map.tiles[deepChunkIndex], "wall")
})

Deno.test("depth charge falls with bubbles and detonates near obstacles", () => {
  const game = createDepthChargeTestGame()
  const dropped = dropDepthCharge(game)

  assertEquals(dropped.turn, 1)
  assertEquals(dropped.torpedoesRemaining, 5)
  assertEquals(dropped.depthCharges.length, 1)
  assert(dropped.trails.length > 0)

  const settled = movePlayer(dropped, "left")
  const detonationIndex = 3 * settled.map.width + 3
  const obstacleIndex = 4 * settled.map.width + 4

  assertEquals(settled.depthCharges.length, 0)
  assertEquals(settled.map.tiles[obstacleIndex], "water")
  assert(settled.sonarFront.some((cell) => cell.index === detonationIndex))
  assert(settled.screenShake > 0)
})

Deno.test("heavy dust blocks sonar reveals behind it", () => {
  const game = createDustSonarGame()
  const emitted = movePlayer(game, "right")
  const spreadDown = movePlayer(emitted, "down")
  const spreadUp = movePlayer(spreadDown, "up")
  const hiddenIndex = 3 * spreadUp.map.width + 7

  assertEquals(emitted.lastSonarTurn, 5)
  assert(spreadUp.dust.length > 0)
  assertEquals(spreadUp.memory[hiddenIndex], null)
  assertEquals(spreadUp.visibility[hiddenIndex], 0)
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
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
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
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
    message: "",
  }
}

function createTorpedoTestGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#....###",
      "#....###",
      "#....###",
      "########",
    ],
    { x: 1, y: 2 },
    { x: 4, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "torpedo-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
    message: "",
  }
}

function createLeftTorpedoTestGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "###....#",
      "###....#",
      "###....#",
      "########",
    ],
    { x: 6, y: 2 },
    { x: 4, y: 2 },
  )

  return {
    map,
    player: { x: 5, y: 2 },
    seed: "left-torpedo-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "left",
    torpedoesRemaining: 6,
    screenShake: 0,
    message: "",
  }
}

function createDepthChargeTestGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "#......#",
      "#...#.##",
      "########",
    ],
    { x: 1, y: 1 },
    { x: 6, y: 3 },
  )

  return {
    map,
    player: { x: 3, y: 1 },
    seed: "depth-charge-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
    message: "",
  }
}

function createCaveInTestGame(): GameState {
  const map = createMapFromRows(
    [
      "################",
      "#..............#",
      "#...........##.#",
      "#.....###...##.#",
      "#.....###......#",
      "#.....###......#",
      "#..............#",
      "#..............#",
      "#..............#",
      "################",
    ],
    { x: 1, y: 4 },
    { x: 14, y: 8 },
  )

  return {
    map,
    player: { x: 4, y: 4 },
    seed: "cave-in-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
    message: "",
  }
}

function createLargeDetachedChunkGame(): GameState {
  const map = createMapFromRows(
    [
      "################",
      "#..............#",
      "#.....########.#",
      "#.....########.#",
      "#.....########.#",
      "#.....########.#",
      "#.....########.#",
      "#.....########.#",
      "#..............#",
      "################",
    ],
    { x: 1, y: 4 },
    { x: 14, y: 8 },
  )

  return {
    map,
    player: { x: 4, y: 4 },
    seed: "large-chunk-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
    message: "",
  }
}

function createDustSonarGame(): GameState {
  const map = createMapFromRows(
    [
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "##########",
    ],
    { x: 1, y: 3 },
    { x: 8, y: 3 },
  )

  return {
    map,
    player: { x: 2, y: 3 },
    seed: "dust-sonar-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [{ index: 3 * map.width + 5, alpha: 1 }],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: 6,
    screenShake: 0,
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
      biomes: ["regular"],
    },
  }
}
