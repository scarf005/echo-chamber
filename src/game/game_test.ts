/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import {
  advanceTurn,
  createGame,
  type Direction,
  dropDepthCharge,
  fireTorpedo,
  type GameState,
  holdPosition,
  movePlayer,
} from "./game.ts"
import {
  type GeneratedMap,
  isPassableTile,
  type Point,
  tileAt,
} from "./mapgen.ts"

Deno.test("createGame is deterministic for the same seed", () => {
  const first = createGame({ seed: "playable-seed", width: 48, height: 24, hostileSubmarineCount: 0 })
  const second = createGame({ seed: "playable-seed", width: 48, height: 24, hostileSubmarineCount: 0 })

  assertEquals(first, second)
})

Deno.test("movePlayer advances into an adjacent passable cell", () => {
  const game = createGame({ seed: "movement-seed", width: 48, height: 24, hostileSubmarineCount: 0 })
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

Deno.test("holdPosition consumes a turn without moving the submarine", () => {
  const game = createFlatGame()
  const next = holdPosition(game)

  assertEquals(next.turn, 1)
  assertEquals(next.player, game.player)
  assertEquals(next.message, "Holding position.")
})

Deno.test("holdPosition does not emit sonar before the fifth turn", () => {
  const game = createFlatGame()
  const next = holdPosition(game)

  assertEquals(next.turn, 1)
  assertEquals(next.player, game.player)
  assertEquals(next.lastSonarTurn, 0)
})

Deno.test("holdPosition emits sonar when it lands on the fifth turn", () => {
  const game = {
    ...createFlatGame(),
    turn: 4,
    lastSonarTurn: 0,
  }
  const next = holdPosition(game)

  assertEquals(next.turn, 5)
  assertEquals(next.player, game.player)
  assertEquals(next.lastSonarTurn, 5)
  assertEquals(next.shockwaves.some((wave) => wave.radius === 2 && wave.senderId === "player"), true)
})

Deno.test("sonar emits on the fifth successful move", () => {
  const game = createGame({ seed: "sonar-seed", width: 48, height: 24, hostileSubmarineCount: 0 })
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
  assertEquals(current.shockwaves.length > 0, true)
  assertEquals(current.shockwaves.some((wave) => wave.radius === 2 && wave.senderId === "player"), true)
  assertEquals(
    current.shockwaveFront.some((cell) =>
      cell.index === current.player.y * current.map.width + current.player.x
    ),
    true,
  )
})

Deno.test("game can be won by following a valid path to the capsule", () => {
  const game = createGame({ seed: "win-seed", width: 48, height: 24, hostileSubmarineCount: 0 })
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
  const next = movePlayer(emitted, "right")
  const wallIndex = emitted.player.y * emitted.map.width + 6
  const hiddenIndex = emitted.player.y * emitted.map.width + 7

  assertEquals(emitted.lastSonarTurn, 5)
  assertEquals(next.memory[wallIndex], "wall")
  assert(next.visibility[wallIndex] > 0)
  assertEquals(next.memory[hiddenIndex], null)
  assertEquals(next.visibility[hiddenIndex], 0)
})

Deno.test("sonar reveals the capsule entity without requiring exact passive vision", () => {
  const game = createCapsuleSonarGame()
  const next = movePlayer(game, "right")

  assertEquals(next.lastSonarTurn, 5)
  assertEquals(next.capsuleKnown, true)
})

Deno.test("fireTorpedo uses facing, deforms walls, and emits a shockwave", () => {
  const game = createTorpedoTestGame()
  const next = fireTorpedo(game)
  const impactIndex = next.player.y * next.map.width + 5

  assertEquals(next.turn, 1)
  assertEquals(next.torpedoAmmo, 5)
  assertEquals(next.map.tiles[impactIndex], "water")
  assert(next.trails.length > 0)
  assert(next.shockwaveFront.some((cell) => cell.index === impactIndex))
  assertEquals(next.shockwaves.some((wave) => wave.radius === 2 && wave.damaging), true)
  assertEquals(next.shockwaves.some((wave) => wave.senderId === "player"), true)
  assertEquals(next.memory[impactIndex], null)
  assert(next.screenShake > 0)
  assertEquals(next.torpedoes.length, 0)
})

Deno.test("fireTorpedo also follows left-facing launch direction", () => {
  const game = createLeftTorpedoTestGame()
  const next = fireTorpedo(game)
  const impactIndex = next.player.y * next.map.width + 2

  assertEquals(next.turn, 1)
  assertEquals(next.torpedoAmmo, 5)
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

Deno.test("player torpedoes proximity-detonate and sink hostile submarines", () => {
  const game = createTorpedoProximityGame()
  const next = fireTorpedo(game, "right")
  const detonationIndex = 2 * next.map.width + 3

  assertEquals(next.turn, 1)
  assertEquals(next.torpedoes.length, 0)
  assertEquals(next.hostileSubmarines.length, 0)
  assert(next.shockwaveFront.some((cell) => cell.index === detonationIndex))
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
  assertEquals(dropped.depthChargeAmmo, 5)
  assertEquals(dropped.depthCharges.length, 1)
  assert(dropped.trails.length > 0)

  const settled = movePlayer(dropped, "left")
  const detonationIndex = 3 * settled.map.width + 3
  const obstacleIndex = 4 * settled.map.width + 4

  assertEquals(settled.depthCharges.length, 0)
  assertEquals(settled.map.tiles[obstacleIndex], "water")
  assert(settled.shockwaveFront.some((cell) => cell.index === detonationIndex))
  assert(settled.screenShake > 0)
})

Deno.test("depth charges proximity-detonate when a hostile submarine closes within two tiles", () => {
  const game = createDepthChargeProximityGame()
  const next = dropDepthCharge(game)
  const detonationIndex = next.map.width + 3

  assertEquals(next.turn, 1)
  assertEquals(next.depthCharges.length, 0)
  assertEquals(next.hostileSubmarines.length, 0)
  assert(next.shockwaveFront.some((cell) => cell.index === detonationIndex))
  assert(next.screenShake > 0)
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

Deno.test("hostile submarines chase nearby shockwaves instead of drifting", () => {
  const game = createHostileInvestigationGame()
  const next = fireTorpedo(game, "left")

  assertEquals(next.hostileSubmarines.length, 1)
  assertEquals(next.hostileSubmarines[0].mode, "investigate")
  assertEquals(next.hostileSubmarines[0].target, { x: 2, y: 2 })
  assertEquals(next.hostileSubmarines[0].position, { x: 11, y: 1 })
})

Deno.test("hostile submarines launch torpedoes and can sink the player", () => {
  const game = createHostileAttackGame()
  const launched = advanceTurn(game, game.player, game.facing, null, "Hold position.")

  assertEquals(launched.torpedoes.length, 1)
  assertEquals(launched.torpedoes[0].senderId, "hostile-1")
  assertEquals(launched.message, "Hostile contact. Incoming torpedo.")

  const destroyed = advanceTurn(launched, launched.player, launched.facing, null, "Hold position.")
  const detonationIndex = 2 * destroyed.map.width + 4

  assertEquals(destroyed.status, "lost")
  assertEquals(destroyed.message, "A hostile torpedo tears through your hull. Press R for a new run.")
  assert(destroyed.shockwaveFront.some((cell) => cell.index === detonationIndex))
})

Deno.test("hostile submarines can ram the player to sink them", () => {
  const game = createHostileRamGame()
  const next = advanceTurn(game, game.player, game.facing, null, "Hold position.")

  assertEquals(next.status, "lost")
  assertEquals(next.message, "A hostile submarine rams your hull. Press R for a new run.")
})

Deno.test("destruction takes priority over capsule recovery on the same turn", () => {
  const game = createHostileCapsuleCollisionGame()
  const next = movePlayer(game, "right")

  assertEquals(next.status, "lost")
  assertEquals(next.player, next.map.capsule)
  assertEquals(next.message, "A hostile submarine rams your hull. Press R for a new run.")
})

Deno.test("createGame spawns deterministic corner pickups away from anchors", () => {
  const first = createGame({ seed: "pickup-seed", width: 64, height: 28 })
  const second = createGame({ seed: "pickup-seed", width: 64, height: 28 })

  assertEquals(first.pickups, second.pickups)
  assert(first.pickups.length > 0)

  for (const pickup of first.pickups) {
    const { x, y } = pickup.position
    assertEquals(tileAt(first.map, x, y), "water")
    assert(
      Math.max(Math.abs(x - first.map.spawn.x), Math.abs(y - first.map.spawn.y)) >= 5,
    )
    assert(
      Math.max(Math.abs(x - first.map.capsule.x), Math.abs(y - first.map.capsule.y)) >= 5,
    )

    const up = tileAt(first.map, x, y - 1)
    const right = tileAt(first.map, x + 1, y)
    const down = tileAt(first.map, x, y + 1)
    const left = tileAt(first.map, x - 1, y)
    const isCorner =
      (up === "wall" && left === "wall" && right === "water" && down === "water") ||
      (up === "wall" && right === "wall" && left === "water" && down === "water") ||
      (right === "wall" && down === "wall" && up === "water" && left === "water") ||
      (down === "wall" && left === "wall" && up === "water" && right === "water")

    assert(isCorner)
  }
})

Deno.test("torpedo pickups add four ammo and respect the sixteen-round cap", () => {
  const game = createPickupGame("torpedo-cache", { torpedoAmmo: 13, depthChargeAmmo: 6 })
  const next = movePlayer(game, "right")

  assertEquals(next.torpedoAmmo, 16)
  assertEquals(next.pickups.length, 0)
  assertEquals(next.message, "Recovered 3 torpedoes.")
})

Deno.test("depth charge pickups add four ammo and respect the sixteen-round cap", () => {
  const game = createPickupGame("depth-charge-cache", { torpedoAmmo: 6, depthChargeAmmo: 14 })
  const next = movePlayer(game, "right")

  assertEquals(next.depthChargeAmmo, 16)
  assertEquals(next.pickups.length, 0)
  assertEquals(next.message, "Recovered 2 depth charges.")
})

Deno.test("map pickups reveal an unexplored terrain sector", () => {
  const game = createPickupGame("map", { torpedoAmmo: 6, depthChargeAmmo: 6 })
  const next = movePlayer(game, "right")

  assertEquals(next.pickups.length, 0)
  assertEquals(next.message, "Recovered a survey map.")
  assertEquals(hasKnownTileBeyondPassiveRange(game), false)
  assertEquals(hasKnownTileBeyondPassiveRange(next), true)
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    facing: "left",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createTorpedoProximityGame(): GameState {
  const map = createMapFromRows(
    [
      "#########",
      "#.......#",
      "#.......#",
      "#.......#",
      "#########",
    ],
    { x: 1, y: 2 },
    { x: 7, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "torpedo-proximity-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 5, y: 2 },
      facing: "left",
      mode: "attack",
      target: { x: 2, y: 2 },
      reload: 2,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createDepthChargeProximityGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "#......#",
      "#......#",
      "########",
    ],
    { x: 1, y: 1 },
    { x: 6, y: 4 },
  )

  return {
    map,
    player: { x: 3, y: 1 },
    seed: "depth-charge-proximity-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 5, y: 3 },
      facing: "left",
      mode: "attack",
      target: { x: 3, y: 1 },
      reload: 2,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createCapsuleSonarGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "#......#",
      "########",
    ],
    { x: 1, y: 2 },
    { x: 5, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "capsule-sonar-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
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
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [],
    trails: [],
    dust: [{ index: 3 * map.width + 5, alpha: 1 }],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createHostileInvestigationGame(): GameState {
  const map = createMapFromRows(
    [
      "##############",
      "#............#",
      "#.#..........#",
      "#............#",
      "##############",
    ],
    { x: 1, y: 2 },
    { x: 12, y: 2 },
  )

  return {
    map,
    player: { x: 4, y: 2 },
    seed: "hostile-investigation-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 12, y: 1 },
      facing: "left",
      mode: "patrol",
      target: null,
      reload: 2,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "left",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createHostileAttackGame(): GameState {
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

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "hostile-attack-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 7, y: 2 },
      facing: "left",
      mode: "attack",
      target: { x: 2, y: 2 },
      reload: 0,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createHostileRamGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "########",
    ],
    { x: 1, y: 2 },
    { x: 6, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "hostile-ram-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 2, y: 1 },
      facing: "left",
      mode: "attack",
      target: { x: 2, y: 2 },
      reload: 1,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createHostileCapsuleCollisionGame(): GameState {
  const map = createMapFromRows(
    [
      "#####",
      "#...#",
      "#####",
    ],
    { x: 1, y: 1 },
    { x: 3, y: 1 },
  )

  return {
    map,
    player: { x: 2, y: 1 },
    seed: "hostile-capsule-collision-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 3, y: 1 },
      facing: "left",
      mode: "patrol",
      target: null,
      reload: 0,
    }],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
  }
}

function createPickupGame(
  kind: "torpedo-cache" | "depth-charge-cache" | "map",
  ammo: { torpedoAmmo: number; depthChargeAmmo: number },
): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 1, y: 3 },
    { x: 10, y: 3 },
  )

  return {
    map,
    player: { x: 2, y: 3 },
    seed: `pickup-${kind}`,
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [{ position: { x: 3, y: 3 }, kind }],
    hostileSubmarines: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: ammo.torpedoAmmo,
    depthChargeAmmo: ammo.depthChargeAmmo,
    screenShake: 0,
    message: "",
  }
}

function hasKnownTileBeyondPassiveRange(game: GameState): boolean {
  return game.memory.some((tile, index) => {
    if (tile === null) {
      return false
    }

    const x = index % game.map.width
    const y = Math.floor(index / game.map.width)
    return Math.max(Math.abs(x - game.player.x), Math.abs(y - game.player.y)) > 2
  })
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
