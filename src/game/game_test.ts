/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { indexForPoint } from "./helpers.ts"

import {
  advanceTurn,
  createGame,
  HOSTILE_GUARD_MAX_CAPSULE_DISTANCE,
  HOSTILE_HUNTER_MIN_COUNT,
  HOSTILE_SALVO_OFFSET,
  type Direction,
  directionBetweenPoints,
  dropDepthCharge,
  findAutoMoveAnomaly,
  findAutoMovePath,
  findPath,
  fireTorpedo,
  type GameState,
  holdPosition,
  isAutoMoveNavigable,
  isPlayerSonarEnabled,
  movePlayer,
  togglePlayerSonar,
} from "./game.ts"
import {
  type GeneratedMap,
  isPassableTile,
  type Point,
  tileAt,
  type TileKind,
} from "./mapgen.ts"

Deno.test("createGame is deterministic for the same seed", () => {
  const first = createGame({
    seed: "playable-seed",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })
  const second = createGame({
    seed: "playable-seed",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })

  assertEquals(first, second)
})

Deno.test("hostile spawns include minimum composition and matching fish", () => {
  const game = createGame({
    seed: "scout-guard-spawn-test",
    width: 72,
    height: 40,
    hostileSubmarineCount: 14,
  })
  const scoutCount = game.hostileSubmarines.filter((hostileSubmarine) =>
    hostileSubmarine.archetype === "scout"
  ).length
  const guards = game.hostileSubmarines.filter((hostileSubmarine) =>
    hostileSubmarine.archetype === "guard"
  )

  const hunterCount = game.hostileSubmarines.filter((hostileSubmarine) =>
    hostileSubmarine.archetype === "hunter"
  ).length

  assertEquals(scoutCount >= 6, true)
  assertEquals(guards.length >= 2, true)
  assertEquals(hunterCount >= HOSTILE_HUNTER_MIN_COUNT, true)
  assertEquals(game.fish?.length, scoutCount)
  assertEquals(
    guards.every((guard) =>
      Math.max(
        Math.abs(guard.position.x - game.map.capsule.x),
        Math.abs(guard.position.y - game.map.capsule.y),
      ) <= HOSTILE_GUARD_MAX_CAPSULE_DISTANCE
    ),
    true,
  )
})

Deno.test("movePlayer advances into an adjacent passable cell", () => {
  const game = createGame({
    seed: "movement-seed",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })
  const direction = findFirstStepDirection(game.map, game.player)

  assert(direction)

  const next = movePlayer(game, direction)

  assertEquals(next.turn, 1)
  assert(next.player.x !== game.player.x || next.player.y !== game.player.y)
})

Deno.test("findPath returns an empty route for an impassable destination", () => {
  const game = createFlatGame()

  assertEquals(findPath(game.map, game.player, { x: 0, y: 0 }), [])
})

Deno.test("auto-move navigates into unknown tiles but rejects charted walls", () => {
  const game = createFlatGame()
  const unknownWall = { x: 0, y: 0 }
  const chartedWallGame = {
    ...game,
    memory: game.memory.slice(),
  }

  chartedWallGame.memory[0] = "wall"

  assertEquals(isAutoMoveNavigable(game, unknownWall), true)
  assertEquals(isAutoMoveNavigable(chartedWallGame, unknownWall), false)
})

Deno.test("auto-move anomalies keep partial hostile contacts generic", () => {
  const game = createFlatGame()
  const contact = { x: 4, y: 2 }
  const index = contact.y * game.map.width + contact.x
  const current = {
    ...game,
    visibility: game.visibility.slice(),
    hostileSubmarines: [{
      id: "hostile-1",
      position: contact,
      facing: "left" as const,
      mode: "patrol" as const,
      target: null,
      reload: 0,
    }],
  }

  current.visibility[index] = 2

  assertEquals(findAutoMoveAnomaly(current), {
    point: contact,
    reason: "sonar",
  })
})

Deno.test("auto-move pathfinding stops once the run is over", () => {
  const game = createFlatGame()
  const destination = { x: game.player.x + 2, y: game.player.y }

  assert(findAutoMovePath(game, destination).length > 0)
  assertEquals(findAutoMovePath({ ...game, status: "lost" }, destination), [])
  assertEquals(findAutoMovePath({ ...game, status: "won" }, destination), [])
})

Deno.test("auto-move anomalies report exact hostile contact at full visibility", () => {
  const game = createFlatGame()
  const contact = { x: 4, y: 2 }
  const index = contact.y * game.map.width + contact.x
  const current = {
    ...game,
    visibility: game.visibility.slice(),
    hostileSubmarines: [{
      id: "hostile-1",
      position: contact,
      facing: "left" as const,
      mode: "patrol" as const,
      target: null,
      reload: 0,
    }],
  }

  current.visibility[index] = 3

  assertEquals(findAutoMoveAnomaly(current), {
    point: contact,
    reason: "enemy submarine in sight",
  })
})

Deno.test("auto-move anomalies report exact fish contact at full visibility", () => {
  const game = createFlatGame()
  const contact = { x: 4, y: 2 }
  const index = contact.y * game.map.width + contact.x
  const current = {
    ...game,
    visibility: game.visibility.slice(),
    fish: [{
      id: "fish-1",
      position: contact,
      facing: "left" as const,
      mode: "idle" as const,
      target: null,
      idleTurnsRemaining: 1,
      travelTurnsRemaining: 0,
    }],
  }

  current.visibility[index] = 3

  assertEquals(findAutoMoveAnomaly(current), {
    point: contact,
    reason: "fish in sight",
  })
})

Deno.test("moving submarines leave bubble trails at their previous position", () => {
  const game = createFlatGame()
  const next = movePlayer(game, "right")
  const trailIndex = game.player.y * game.map.width + game.player.x

  assert(
    next.trails.some((cell) => cell.index === trailIndex && cell.alpha >= 0.68),
  )
})

Deno.test("bubble trails last 20 turns and fade by five percent per turn", () => {
  const game = createFlatGame()
  const moved = movePlayer(game, "right")
  const trailIndex = game.player.y * game.map.width + game.player.x

  let current = moved

  for (let turn = 0; turn < 19; turn += 1) {
    current = holdPosition(current)
  }

  assertEquals(
    current.trails.find((cell) => cell.index === trailIndex)?.alpha,
    0.05,
  )

  assertEquals(current.trails.some((cell) => cell.index === trailIndex), true)

  current = holdPosition(current)

  assertEquals(current.trails.some((cell) => cell.index === trailIndex), false)
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
  assertEquals(next.playerSonarContactCueCount, 0)
  assertEquals(
    next.shockwaves.some((wave) =>
      wave.radius === 2 && wave.senderId === "player"
    ),
    true,
  )
})

Deno.test("player sonar contact cue fires when the expanding wave hits the capsule", () => {
  const emitted = holdPosition({
    ...createFlatGame(),
    turn: 4,
    lastSonarTurn: 0,
  })
  const contacted = holdPosition(emitted)

  assertEquals(emitted.playerSonarContactCueCount, 0)
  assertEquals(contacted.playerSonarContactCueCount, 1)
})

Deno.test("player sonar contact cue fires when a hit hostile moves before reveals resolve", () => {
  const game = createPlayerSonarCueHostileGame()
  const next = holdPosition(game)

  assertEquals(next.playerSonarContactCueCount, 1)
  assertEquals(next.hostileSubmarines[0].lastKnownPlayerPosition, next.player)
})

Deno.test("player sonar contact cue uses digital audio for non-hostile fish", () => {
  const emitted = holdPosition({
    ...createFlatGame(),
    turn: 4,
    lastSonarTurn: 0,
    fish: [{
      id: "fish-1",
      position: { x: 5, y: 2 },
      facing: "right",
      mode: "idle",
      target: null,
      idleTurnsRemaining: 0,
      travelTurnsRemaining: 0,
    }],
  })
  const contacted = holdPosition(emitted)
  const fishIndex = contacted.map.width * 2 + 5

  assertEquals(contacted.playerSonarContactCueCount, 1)
  assertEquals(contacted.entityMemory?.[fishIndex], "non-hostile")
})

Deno.test("player entity hit cue fires when the bow pulps a fish", () => {
  const game = {
    ...createFlatGame(),
    fish: [{
      id: "fish-1",
      position: { x: 3, y: 2 },
      facing: "right" as const,
      mode: "idle" as const,
      target: null,
      idleTurnsRemaining: 0,
      travelTurnsRemaining: 0,
    }],
    playerEntityHitCueCount: 0,
  }
  const next = movePlayer(game, "right")

  assertEquals(next.playerEntityHitCueCount, 1)
  assertEquals(next.fish, [])
  assertEquals(next.message, "You paste a fish against the bow.")
})

Deno.test("player entity hit cue fires when a torpedo catches a fish", () => {
  const game = {
    ...createFlatGame(),
    fish: [{
      id: "fish-1",
      position: { x: 4, y: 2 },
      facing: "right" as const,
      mode: "idle" as const,
      target: null,
      idleTurnsRemaining: 0,
      travelTurnsRemaining: 0,
    }],
    playerEntityHitCueCount: 0,
  }
  const next = fireTorpedo(game, "right")

  assertEquals(next.playerEntityHitCueCount, 1)
  assertEquals(next.fish, [])
})

Deno.test("player death cue fires when a hostile torpedo sinks the sub", () => {
  const game = createHostileAttackGame()
  const launched = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )
  const destroyed = advanceTurn(
    launched,
    launched.player,
    launched.facing,
    null,
    "Hold position.",
  )

  assertEquals(launched.playerDeathCueCount, 0)
  assertEquals(destroyed.playerDeathCueCount, 1)
})

Deno.test("togglePlayerSonar flips the player sonar state without consuming a turn", () => {
  const game = createFlatGame()
  const toggled = togglePlayerSonar(game)

  assertEquals(isPlayerSonarEnabled(game), true)
  assertEquals(isPlayerSonarEnabled(toggled), false)
  assertEquals(toggled.turn, game.turn)
  assertEquals(toggled.message, "Player sonar disabled.")
  assertEquals(toggled.logs.at(-1), {
    message: "Player sonar disabled.",
    type: "negative",
  })

  const restored = togglePlayerSonar(toggled)

  assertEquals(isPlayerSonarEnabled(restored), true)
  assertEquals(restored.message, "Player sonar enabled.")
})

Deno.test("disabled player sonar skips the fifth-turn sonar pulse", () => {
  const game = togglePlayerSonar({
    ...createFlatGame(),
    turn: 4,
    lastSonarTurn: 0,
  })
  const next = holdPosition(game)

  assertEquals(next.turn, 5)
  assertEquals(isPlayerSonarEnabled(next), false)
  assertEquals(next.lastSonarTurn, 0)
  assertEquals(next.playerSonarContactCueCount, 0)
  assertEquals(
    next.shockwaves.some((wave) => wave.senderId === "player"),
    false,
  )
})

Deno.test("sonar emits on the fifth successful move", () => {
  const game = createGame({
    seed: "sonar-seed",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })
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
  assertEquals(
    current.shockwaves.some((wave) =>
      wave.radius === 2 && wave.senderId === "player"
    ),
    true,
  )
  assertEquals(
    current.shockwaveFront.some((cell) =>
      cell.index === current.player.y * current.map.width + current.player.x
    ),
    true,
  )
})

Deno.test("game is won by bringing the capsule back to the dock", () => {
  const game = createGame({
    seed: "win-seed",
    width: 48,
    height: 24,
    hostileSubmarineCount: 0,
  })
  const toCapsule = findPath(game.map, game.player, game.map.capsule)

  let current = game

  for (let index = 1; index < toCapsule.length; index += 1) {
    current = movePlayer(
      current,
      directionBetween(toCapsule[index - 1], toCapsule[index]),
    )
  }

  assertEquals(current.status, "playing")
  assertEquals(current.player, current.map.capsule)
  assertEquals(current.capsuleCollected, true)
  assertEquals(current.message, "Capsule retrieved. Return to dock.")

  const toDock = findPath(current.map, current.player, current.map.spawn)

  for (let index = 1; index < toDock.length; index += 1) {
    current = movePlayer(
      current,
      directionBetween(toDock[index - 1], toDock[index]),
    )
  }

  assertEquals(current.status, "won")
  assertEquals(current.player, current.map.spawn)
  assertEquals(current.capsuleCollected, true)
  assertEquals(
    current.message,
    "Capsule delivered to dock. Press R for a new run.",
  )
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
  assertEquals(
    next.shockwaves.some((wave) => wave.radius === 2 && wave.damaging),
    true,
  )
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

Deno.test("torpedoes keep cruising beyond sonar range until they hit a wall", () => {
  const game = createLongRangeTorpedoGame()
  const launched = fireTorpedo(game, "right")
  const impactIndex = 2 * launched.map.width + 30

  let current = launched

  for (let turn = 0; turn < 6; turn += 1) {
    current = holdPosition(current)
  }

  assertEquals(current.torpedoes.length > 0, true)
  assertEquals(current.map.tiles[impactIndex], "wall")

  for (let turn = 0; turn < 3; turn += 1) {
    current = holdPosition(current)
  }

  assertEquals(current.torpedoes.length, 0)
  assertEquals(current.map.tiles[impactIndex], "water")
  assert(current.shockwaveFront.some((cell) => cell.index === impactIndex))
})

Deno.test("large detached wall chunks stay put when 36 or more tiles remain", () => {
  const game = createLargeDetachedChunkGame()
  const next = fireTorpedo(game, "right")
  const deepChunkIndex = 4 * next.map.width + 10

  assert(next.cracks.length > 0)
  assertEquals(next.fallingBoulders.length, 0)
  assertEquals(next.map.tiles[deepChunkIndex], "wall")
})

Deno.test("repeated torpedo strikes can collapse a large detached chunk", () => {
  let current = createLargeDetachedChunkGame()
  const deepChunkIndex = 4 * current.map.width + 10

  for (let shot = 0; shot < 3; shot += 1) {
    current = fireTorpedo(current, "right")
  }

  assert((current.structuralDamage?.some((value) => value > 0) ?? false))
  assert(current.fallingBoulders.length > 0)
  assertEquals(current.map.tiles[deepChunkIndex], "water")
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
  const launched = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )

  assertEquals(launched.torpedoes.length, 1)
  assertEquals(launched.torpedoes[0].senderId, "hostile-1")
  assertEquals(launched.message, "Hold position.")

  const destroyed = advanceTurn(
    launched,
    launched.player,
    launched.facing,
    null,
    "Hold position.",
  )
  const detonationIndex = 2 * destroyed.map.width + 4

  assertEquals(destroyed.status, "lost")
  assertEquals(
    destroyed.message,
    "A hostile torpedo tears through your hull. Press R for a new run.",
  )
  assert(
    destroyed.shockwaveFront.some((cell) => cell.index === detonationIndex),
  )
})

Deno.test("hostile sonar contact logs red and leaves an imprecise marker", () => {
  const game = createEnemySonarContactGame()
  const next = holdPosition(game)
  const hostileOrigin = { x: 8, y: 2 }
  const hostileContacts = next.entityMemory
    ?.map((kind, index) => ({
      kind,
      point: {
        x: index % next.map.width,
        y: Math.floor(index / next.map.width),
      },
    }))
    .filter((entry) => entry.kind === "enemy") ?? []

  assertEquals(next.hostileSonarContactCueCount, 1)
  assertEquals(next.message, "hostile sonar from →")
  assertEquals(next.logs.at(-1), {
    message: "hostile sonar from →",
    type: "negative",
  })
  assertEquals(hostileContacts.length > 0, true)
  assertEquals(
    hostileContacts.some((entry) => {
      const distance = Math.max(
        Math.abs(entry.point.x - hostileOrigin.x),
        Math.abs(entry.point.y - hostileOrigin.y),
      )
      return distance >= 1 && distance <= 2
    }),
    true,
  )
})

Deno.test("non-hostile shockwaves do not trigger hostile sonar contact", () => {
  const game = createNonHostileShockwaveGame()
  const next = holdPosition(game)

  assertEquals(next.hostileSonarContactCueCount, 0)
  assertEquals(next.message, "Holding position.")
  assertEquals(next.entityMemory?.every((entry) => entry === null), true)
})

Deno.test("hostile scouts sonar every five turns while patrolling", () => {
  const game = createScoutSonarCadenceGame()
  const next = holdPosition(game)

  assertEquals(next.hostileSubmarines[0].lastSonarTurn, 5)
  assertEquals(
    next.shockwaves.some((wave) =>
      wave.senderId === "hostile-1" && wave.damaging === false
    ),
    true,
  )
})

Deno.test("guard submarines patrol the capsule, sonar every ten turns, and fire at threats", () => {
  const patrolGame = createGuardPatrolGame()
  const patrolling = holdPosition(patrolGame)
  const guard = patrolling.hostileSubmarines[0]
  const threatGame = createGuardThreatGame()
  const engaged = holdPosition(threatGame)

  assertEquals(guard.archetype, "guard")
  assertEquals(guard.lastSonarTurn, 10)
  assertEquals(
    Math.max(
      Math.abs(guard.position.x - patrolling.map.capsule.x),
      Math.abs(guard.position.y - patrolling.map.capsule.y),
    ) <= HOSTILE_GUARD_MAX_CAPSULE_DISTANCE,
    true,
  )
  assertEquals(
    patrolling.shockwaves.some((wave) => wave.senderId === "hostile-1"),
    true,
  )
  assertEquals(engaged.torpedoes.length, 1)
  assertEquals(engaged.torpedoes[0].senderId, "hostile-1")
})

Deno.test("hostile submarines use torpedo proximity when the player is near their lane", () => {
  const game = createHostileProximityAttackGame()
  const launched = holdPosition(game)

  assertEquals(launched.torpedoes.length, 1)
  assertEquals(launched.torpedoes[0].direction, "left")
  assertEquals(launched.depthCharges.length, 0)
  assertEquals(launched.hostileSubmarines[0].torpedoAmmo, 5)
})

Deno.test("hostile submarines can trigger cave-ins by firing at rock above the player", () => {
  const game = createHostileCeilingTrapGame()
  const armed = holdPosition(game)
  const triggered = holdPosition(armed)
  const collapsed = holdPosition(triggered)

  assertEquals(armed.torpedoes.length, 1)
  assertEquals(armed.torpedoes[0].direction, "left")
  assertEquals(collapsed.status, "lost")
  assertEquals(
    collapsed.message,
    "Cave-in debris crushes your hull. Press R for a new run.",
  )
})

Deno.test("hostile submarines use VLS when the player is directly above them", () => {
  const game = createHostileVlsAttackGame()
  const launched = holdPosition(game)

  assertEquals(launched.torpedoes.length, 1)
  assertEquals(launched.torpedoes[0].senderId, "hostile-1")
  assertEquals(launched.torpedoes[0].direction, "up")
  assertEquals(launched.depthCharges.length, 0)
  assertEquals(launched.hostileSubmarines[0].vlsAmmo, 5)
  assertEquals(launched.hostileSubmarines[0].depthChargeAmmo, 6)
})

Deno.test("hostile submarines avoid suicidal VLS cave-ins", () => {
  const game = createHostileUnsafeVlsCaveInGame()
  const launched = holdPosition(game)

  assertEquals(launched.torpedoes.length, 1)
  assertEquals(launched.hostileSubmarines[0].debugState?.attack.attackTarget, { x: 5, y: 3 })
  assertEquals(launched.hostileSubmarines[0].debugState?.attack.ceilingTrapDirection, null)
})

Deno.test("hostile submarines use VLS cave-ins when they have an escape lane", () => {
  const game = createHostileSafeVlsCaveInGame()
  const launched = holdPosition(game)

  assertEquals(launched.torpedoes.length, 1)
  assertEquals(launched.torpedoes[0].direction, "up")
  assertEquals(launched.hostileSubmarines[0].debugState?.attack.attackTarget, { x: 5, y: 2 })
  assertEquals(launched.hostileSubmarines[0].debugState?.attack.ceilingTrapDirection, "up")
})

Deno.test("hostile submarines do not waste depth charges on targets directly above", () => {
  const game = createHostileAboveWithoutVlsGame()
  const launched = holdPosition(game)

  assertEquals(launched.torpedoes.length, 0)
  assertEquals(launched.depthCharges.length, 0)
  assertEquals(launched.hostileSubmarines[0].vlsAmmo, 0)
  assertEquals(launched.hostileSubmarines[0].depthChargeAmmo, 6)
  assertEquals(launched.hostileSubmarines[0].reload, 0)
})

Deno.test("hostile submarines do not waste ranged ammo on diagonal targets", () => {
  const game = createHostileDiagonalContactGame()
  const next = holdPosition(game)

  assertEquals(next.torpedoes.length, 0)
  assertEquals(next.depthCharges.length, 0)
  assertEquals(next.hostileSubmarines[0].torpedoAmmo, 6)
  assertEquals(next.hostileSubmarines[0].vlsAmmo, 6)
  assertEquals(next.hostileSubmarines[0].depthChargeAmmo, 6)
})

Deno.test("hostile submarines do not fire without a fresh player fix", () => {
  const game = createHostileNoEvidenceGame()
  const next = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )

  assertEquals(next.torpedoes.length, 0)
  assertEquals(next.depthCharges.length, 0)
})

Deno.test("hunters chase relayed sonar fixes instead of firing blind volleys", () => {
  const game = createPlayerSonarAlertGame()
  const next = holdPosition(game)
  const trailingHunter = next.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-2"
  )

  assertEquals(next.torpedoes.length, 0)
  assertEquals(next.depthCharges.length, 0)
  assertEquals(trailingHunter?.position, { x: 13, y: 2 })
  assertEquals(trailingHunter?.torpedoAmmo, 6)
  assertEquals(trailingHunter?.depthChargeAmmo, 6)
})

Deno.test("hunters keep closing the lane while reloading", () => {
  const game = createHunterReloadPursuitGame()
  const next = holdPosition(game)

  assertEquals(next.torpedoes.length, 0)
  assertEquals(next.depthCharges.length, 0)
  assertEquals(next.hostileSubmarines[0].position, { x: 6, y: 2 })
  assertEquals(next.hostileSubmarines[0].reload, 1)
})

Deno.test("investigating hostiles do not immediately backtrack one tile", () => {
  const game = createHostileBacktrackGame()
  const next = holdPosition(game)

  assert(
    next.hostileSubmarines[0].position.x !== 4 ||
      next.hostileSubmarines[0].position.y !== 2,
  )
})

Deno.test("hunters schedule a three-tile salvo offset lane after the first shot", () => {
  const first = holdPosition(createHunterSalvoOffsetGame())
  const firstHunter = first.hostileSubmarines[0]
  const firstShotLane = first.torpedoes[0].position.y
  const repositioning = holdPosition(first)
  const repositioningHunter = repositioning.hostileSubmarines[0]

  assertEquals(firstHunter.salvoMoveTarget !== null, true)
  assertEquals(
    Math.abs((firstHunter.salvoMoveTarget?.y ?? firstShotLane) - firstShotLane),
    HOSTILE_SALVO_OFFSET,
  )
  assertEquals(
    repositioningHunter.position.y,
    firstShotLane + (firstHunter.salvoStepDirection === "up" ? -1 : 1),
  )
})

Deno.test("hostile submarines can ram the player to sink them", () => {
  const game = createHostileRamGame()
  const next = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )

  assertEquals(next.status, "lost")
  assertEquals(
    next.message,
    "A hostile submarine rams your hull. Press R for a new run.",
  )
})

Deno.test("scout sonar messages hand off the player's location to hunters", () => {
  const game = createHostileCommunicationGame()
  const pinged = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )
  const relayed = advanceTurn(
    pinged,
    pinged.player,
    pinged.facing,
    null,
    "Hold position.",
  )
  const hunter = relayed.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-2"
  )

  assertEquals(
    pinged.shockwaves.some((wave) =>
      wave.senderId === "hostile-1" && wave.message?.kind === "player-location"
    ),
    true,
  )
  assertEquals(hunter?.lastKnownPlayerPosition, relayed.player)
})

Deno.test("scouts fire at their estimated player position before retreating", () => {
  const game = createScoutFireBeforeRetreatGame()
  const fired = holdPosition(game)
  const retreated = holdPosition(fired)

  assertEquals(fired.torpedoes.length, 1)
  assertEquals(fired.torpedoes[0].senderId, "hostile-1")
  assertEquals(fired.hostileSubmarines[0].position, { x: 10, y: 4 })
  assertEquals(fired.hostileSubmarines[0].lastKnownPlayerPosition, { x: 4, y: 4 })
  assertEquals(retreated.hostileSubmarines[0].position, { x: 11, y: 4 })
  assertEquals(retreated.status, "playing")
})

Deno.test("scouts keep a valid exploration target instead of retargeting every turn", () => {
  const game = createScoutExplorationPersistenceGame()
  const first = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )
  const second = advanceTurn(
    first,
    first.player,
    first.facing,
    null,
    "Hold position.",
  )

  assertEquals(first.hostileSubmarines[0].target, { x: 15, y: 2 })
  assertEquals(first.hostileSubmarines[0].position, { x: 11, y: 2 })
  assertEquals(second.hostileSubmarines[0].target, { x: 15, y: 2 })
  assertEquals(second.hostileSubmarines[0].position, { x: 12, y: 2 })
})

Deno.test("scouts prefer deeper unexplored frontiers over adjacent unknown tiles", () => {
  const game = createScoutExplorationFrontierGame()
  const next = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )
  const target = next.hostileSubmarines[0].target

  assertEquals(next.hostileSubmarines[0].position.x !== 10, true)
  assert(target !== null)
  assertEquals(Math.abs(target!.x - 10) + Math.abs(target!.y - 2) >= 4, true)
})

Deno.test("enemies hit by player sonar immediately relay the player position", () => {
  const game = createPlayerSonarAlertGame()
  const next = holdPosition(game)
  const firstHostile = next.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-1"
  )
  const secondHostile = next.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-2"
  )

  assertEquals(firstHostile?.lastKnownPlayerPosition, next.player)
  assertEquals(firstHostile?.mode, "attack")
  assertEquals(secondHostile?.lastKnownPlayerPosition, next.player)
  assertEquals(secondHostile?.mode, "attack")
})

Deno.test("retrieving the capsule alerts every hostile immediately", () => {
  const game = createCapsuleAlarmGame()
  const next = movePlayer(game, "right")

  assertEquals(next.capsuleCollected, true)
  assertEquals(next.message, "Capsule retrieved. Return to dock.")
  assertEquals(
    next.hostileSubmarines.every((hostile) =>
      hostile.lastKnownPlayerPosition?.x === next.player.x &&
      hostile.lastKnownPlayerPosition?.y === next.player.y
    ),
    true,
  )
})

Deno.test("same-turn hostile relay does not depend on hostile iteration order", () => {
  const game = createReversedPlayerSonarAlertGame()
  const next = holdPosition(game)
  const firstHostile = next.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-1"
  )
  const secondHostile = next.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-2"
  )

  assertEquals(firstHostile?.lastKnownPlayerPosition, next.player)
  assertEquals(secondHostile?.lastKnownPlayerPosition, next.player)
})

Deno.test("player sonar does not alert hostiles hidden behind walls", () => {
  const game = createBlockedPlayerSonarAlertGame()
  const next = holdPosition(game)

  assertEquals(next.hostileSubmarines[0].lastKnownPlayerPosition, null)
  assertEquals(next.hostileSubmarines[0].mode, "investigate")
})

Deno.test("turtles stay dormant when only another hostile relays the player fix", () => {
  const game = createTurtleRelayGame()
  const next = holdPosition(game)
  const turtle = next.hostileSubmarines.find((hostile) =>
    hostile.id === "hostile-2"
  )

  assertEquals(turtle?.archetype, "turtle")
  assertEquals(turtle?.mode, "patrol")
})

Deno.test("turtles switch to hunter behavior when the player enters visual range", () => {
  const game = createTurtleAwarenessGame()
  const next = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )

  assertEquals(next.hostileSubmarines[0].archetype, "hunter")
  assertEquals(next.hostileSubmarines[0].mode, "attack")
})

Deno.test("enemy sonar only becomes visible when the emitter has line of sight", () => {
  const visibleGame = createEnemySonarVisibilityGame(false)
  const hiddenGame = createEnemySonarVisibilityGame(true)
  const visibleNext = advanceTurn(
    visibleGame,
    visibleGame.player,
    visibleGame.facing,
    null,
    "Hold position.",
  )
  const hiddenNext = advanceTurn(
    hiddenGame,
    hiddenGame.player,
    hiddenGame.facing,
    null,
    "Hold position.",
  )

  assertEquals(
    visibleNext.shockwaves.some((wave) =>
      wave.senderId === "hostile-1" && wave.visibleToPlayer === true
    ),
    true,
  )
  assertEquals(
    hiddenNext.shockwaveFront.every((cell) => cell.requiresVisibility === true),
    true,
  )
})

Deno.test("enemy explosion fronts stay visibility-gated", () => {
  const game = createEnemyExplosionVisibilityGame()
  const next = advanceTurn(
    game,
    game.player,
    game.facing,
    null,
    "Hold position.",
  )

  assertEquals(
    next.shockwaveFront.every((cell) => cell.requiresVisibility === true),
    true,
  )
})

Deno.test("destruction takes priority over dock extraction on the same turn", () => {
  const game = createHostileDockCollisionGame()
  const next = movePlayer(game, "left")

  assertEquals(next.status, "lost")
  assertEquals(next.player, next.map.spawn)
  assertEquals(
    next.message,
    "A hostile submarine rams your hull. Press R for a new run.",
  )
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
      Math.max(
        Math.abs(x - first.map.spawn.x),
        Math.abs(y - first.map.spawn.y),
      ) >= 5,
    )
    assert(
      Math.max(
        Math.abs(x - first.map.capsule.x),
        Math.abs(y - first.map.capsule.y),
      ) >= 5,
    )

    const up = tileAt(first.map, x, y - 1)
    const right = tileAt(first.map, x + 1, y)
    const down = tileAt(first.map, x, y + 1)
    const left = tileAt(first.map, x - 1, y)
    const isCorner = (up === "wall" && left === "wall" && right === "water" &&
      down === "water") ||
      (up === "wall" && right === "wall" && left === "water" &&
        down === "water") ||
      (right === "wall" && down === "wall" && up === "water" &&
        left === "water") ||
      (down === "wall" && left === "wall" && up === "water" &&
        right === "water")

    assert(isCorner)
  }
})

Deno.test("torpedo pickups add four ammo and respect the sixteen-round cap", () => {
  const game = createPickupGame("torpedo-cache", {
    torpedoAmmo: 13,
    depthChargeAmmo: 6,
  })
  const next = movePlayer(game, "right")

  assertEquals(next.torpedoAmmo, 16)
  assertEquals(next.pickups.length, 0)
  assertEquals(next.playerPickupCueCount, 1)
  assertEquals(next.message, "Recovered 3 torpedoes.")
})

Deno.test("depth charge pickups add four ammo and respect the sixteen-round cap", () => {
  const game = createPickupGame("depth-charge-cache", {
    torpedoAmmo: 6,
    depthChargeAmmo: 14,
  })
  const next = movePlayer(game, "right")

  assertEquals(next.depthChargeAmmo, 16)
  assertEquals(next.pickups.length, 0)
  assertEquals(next.playerPickupCueCount, 1)
  assertEquals(next.message, "Recovered 2 depth charges.")
})

Deno.test("map pickups reveal an unexplored terrain sector", () => {
  const game = createPickupGame("map", { torpedoAmmo: 6, depthChargeAmmo: 6 })
  const next = movePlayer(game, "right")

  assertEquals(next.pickups.length, 0)
  assertEquals(next.playerPickupCueCount, 1)
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

function directionBetween(from: Point, to: Point): Direction {
  const direction = directionBetweenPoints(from, to)

  if (!direction) {
    throw new Error("Expected adjacent points to produce a direction")
  }

  return direction
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerDeathCueCount: 0,
    playerPickupCueCount: 0,
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 8, y: 2 },
      archetype: "turtle",
      lastSonarTurn: 1,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 8, y: 2 },
      archetype: "turtle",
      lastSonarTurn: 1,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
  }
}

function createLongRangeTorpedoGame(): GameState {
  const map = createMapFromRows(
    [
      "################################",
      "#..............................#",
      "#.............................##",
      "#..............................#",
      "################################",
    ],
    { x: 1, y: 2 },
    { x: 29, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "long-range-torpedo-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
  }
}

function createHostileVlsAttackGame(): GameState {
  const map = createMapFromRows(
    [
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "##########",
    ],
    { x: 1, y: 4 },
    { x: 8, y: 1 },
  )

  return {
    map,
    player: { x: 4, y: 1 },
    seed: "hostile-vls-attack-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 4, y: 4 },
      archetype: "hunter",
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHostileAboveWithoutVlsGame(): GameState {
  const game = createHostileVlsAttackGame()

  return {
    ...game,
    seed: "hostile-above-without-vls-test",
    hostileSubmarines: [{
      ...game.hostileSubmarines[0],
      position: { ...game.hostileSubmarines[0].position },
      initialPosition: game.hostileSubmarines[0].initialPosition
        ? { ...game.hostileSubmarines[0].initialPosition }
        : { ...game.hostileSubmarines[0].position },
      vlsAmmo: 0,
    }],
  }
}

function createHostileUnsafeVlsCaveInGame(): GameState {
  const map = createMapFromRows(
    [
      "###########",
      "#.........#",
      "#....#....#",
      "#.........#",
      "#.........#",
      "#.........#",
      "###########",
    ],
    { x: 1, y: 5 },
    { x: 9, y: 1 },
  )

  return {
    map,
    player: { x: 5, y: 3 },
    seed: "hostile-unsafe-vls-cave-in-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 5, y: 4 },
      archetype: "hunter",
    })],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHostileSafeVlsCaveInGame(): GameState {
  const game = createHostileUnsafeVlsCaveInGame()

  return {
    ...game,
    seed: "hostile-safe-vls-cave-in-test",
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 5, y: 5 },
      archetype: "hunter",
    })],
  }
}

function createHostileDiagonalContactGame(): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 1, y: 5 },
    { x: 10, y: 1 },
  )

  return {
    map,
    player: { x: 2, y: 1 },
    seed: "hostile-diagonal-contact-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 7, y: 4 },
      archetype: "hunter",
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createScoutSonarCadenceGame(): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 1, y: 2 },
    { x: 10, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "scout-sonar-cadence-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 8, y: 2 },
      archetype: "scout",
      lastSonarTurn: 0,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHostileProximityAttackGame(): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 1, y: 4 },
    { x: 10, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "hostile-proximity-attack-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 7, y: 4 },
      archetype: "hunter",
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHostileCeilingTrapGame(): GameState {
  const map = createMapFromRows(
    [
      "###########",
      "#.........#",
      "#.........#",
      "#....#....#",
      "#.........#",
      "#.........#",
      "#.........#",
      "###########",
    ],
    { x: 1, y: 5 },
    { x: 9, y: 5 },
  )

  return {
    map,
    player: { x: 5, y: 6 },
    seed: "hostile-ceiling-trap-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 8, y: 3 },
      archetype: "hunter",
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHostileNoEvidenceGame(): GameState {
  return {
    map: createMapFromRows(
      [
        "##############",
        "#............#",
        "#............#",
        "#............#",
        "##############",
      ],
      { x: 1, y: 2 },
      { x: 12, y: 2 },
    ),
    player: { x: 2, y: 2 },
    seed: "hostile-no-evidence-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: 14 * 5 }, () => null),
    entityMemory: Array.from({ length: 14 * 5 }, () => null),
    visibility: Array.from({ length: 14 * 5 }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 11, y: 1 },
      archetype: "hunter",
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHunterReloadPursuitGame(): GameState {
  const game = createHostileAttackGame()

  return {
    ...game,
    seed: "hunter-reload-pursuit-test",
    hostileSubmarines: [{
      ...createHostile({
        id: "hostile-1",
        position: { x: 7, y: 2 },
        archetype: "hunter",
      }),
      reload: 2,
    }],
  }
}

function createGuardPatrolGame(): GameState {
  const map = createMapFromRows(
    [
      "##################",
      "#................#",
      "#................#",
      "#................#",
      "#................#",
      "##################",
    ],
    { x: 1, y: 3 },
    { x: 9, y: 3 },
  )

  return {
    map,
    player: { x: 2, y: 1 },
    seed: "guard-patrol-test",
    turn: 9,
    status: "playing",
    playerSonarEnabled: false,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 11, y: 3 },
      archetype: "guard",
      lastSonarTurn: 0,
    })],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createGuardThreatGame(): GameState {
  const game = createGuardPatrolGame()

  return {
    ...game,
    seed: "guard-threat-test",
    turn: 0,
    player: { x: 5, y: 3 },
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 11, y: 3 },
      archetype: "guard",
      lastKnownPlayerPosition: { x: 5, y: 3 },
      lastKnownPlayerTurn: 0,
    })],
  }
}

function createHostileBacktrackGame(): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 1, y: 2 },
    { x: 10, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 1 },
    seed: "hostile-backtrack-test",
    turn: 0,
    status: "playing",
    playerSonarEnabled: false,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 5, y: 2 },
      archetype: "hunter",
      previousPosition: { x: 4, y: 2 },
    })],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHunterSalvoOffsetGame(): GameState {
  const map = createMapFromRows(
    [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    { x: 1, y: 5 },
    { x: 18, y: 5 },
  )

  return {
    map,
    player: { x: 3, y: 5 },
    seed: "hunter-salvo-offset-test",
    turn: 0,
    status: "playing",
    playerSonarEnabled: false,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 10, y: 4 },
      archetype: "hunter",
      lastKnownPlayerPosition: { x: 3, y: 5 },
      lastKnownPlayerTurn: 0,
    })],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
  }
}

function createHostileDockCollisionGame(): GameState {
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
    seed: "hostile-dock-collision-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    capsuleCollected: true,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [{
      id: "hostile-1",
      position: { x: 1, y: 1 },
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
    logs: [],
  }
}

function createCapsuleAlarmGame(): GameState {
  const map = createMapFromRows(
    [
      "############",
      "#..........#",
      "#..........#",
      "############",
    ],
    { x: 1, y: 1 },
    { x: 3, y: 1 },
  )

  return {
    map,
    player: { x: 2, y: 1 },
    seed: "capsule-alarm-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [
      createHostile({
        id: "hostile-1",
        position: { x: 8, y: 1 },
        archetype: "hunter",
      }),
      createHostile({
        id: "hostile-2",
        position: { x: 10, y: 1 },
        archetype: "turtle",
      }),
    ],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createHostileCommunicationGame(): GameState {
  const map = createMapFromRows(
    [
      "################",
      "#..............#",
      "#..............#",
      "#..............#",
      "################",
    ],
    { x: 1, y: 2 },
    { x: 14, y: 2 },
  )

  return {
    map,
    player: { x: 4, y: 2 },
    seed: "hostile-communication-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [
      createHostile({
        id: "hostile-1",
        position: { x: 8, y: 2 },
        archetype: "scout",
        target: { x: 4, y: 2 },
        lastKnownPlayerPosition: { x: 4, y: 2 },
        lastKnownPlayerTurn: 4,
        lastSonarTurn: 0,
      }),
      createHostile({
        id: "hostile-2",
        position: { x: 12, y: 2 },
        archetype: "hunter",
        lastSonarTurn: 0,
      }),
    ],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createScoutFireBeforeRetreatGame(): GameState {
  const map = createMapFromRows(
    [
      "##############",
      "#............#",
      "#............#",
      "#............#",
      "#............#",
      "#............#",
      "##############",
    ],
    { x: 1, y: 3 },
    { x: 12, y: 3 },
  )

  return {
    map,
    player: { x: 2, y: 1 },
    seed: "scout-fire-before-retreat-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [
      createHostile({
        id: "hostile-1",
        position: { x: 10, y: 4 },
        archetype: "scout",
        lastKnownPlayerPosition: { x: 4, y: 4 },
        lastKnownPlayerTurn: 0,
      }),
      {
        ...createHostile({
          id: "hostile-2",
          position: { x: 12, y: 5 },
          archetype: "hunter",
        }),
        torpedoAmmo: 0,
        vlsAmmo: 0,
        depthChargeAmmo: 0,
      },
    ],
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createTurtleAwarenessGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
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
    seed: "turtle-awareness-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 4, y: 2 },
      archetype: "turtle",
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createScoutExplorationPersistenceGame(): GameState {
  const map = createMapFromRows(
    [
      "##################",
      "#................#",
      "#................#",
      "#................#",
      "##################",
    ],
    { x: 1, y: 2 },
    { x: 16, y: 2 },
  )
  const memory: Array<TileKind | null> = Array.from(
    { length: map.tiles.length },
    () => null,
  )

  for (
    const point of [
      { x: 10, y: 2 },
      { x: 11, y: 2 },
      { x: 12, y: 2 },
      { x: 13, y: 2 },
    ]
  ) {
    memory[indexForPoint(map.width, point)] = "water"
  }

  return {
    map,
    player: { x: 1, y: 1 },
    seed: "scout-exploration-persistence-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory,
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 10, y: 2 },
      archetype: "scout",
      target: { x: 15, y: 2 },
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createScoutExplorationFrontierGame(): GameState {
  const map = createMapFromRows(
    [
      "##################",
      "#................#",
      "#................#",
      "#................#",
      "##################",
    ],
    { x: 1, y: 2 },
    { x: 16, y: 2 },
  )
  const memory: Array<TileKind | null> = Array.from(
    { length: map.tiles.length },
    () => null,
  )

  for (
    const point of [
      { x: 9, y: 2 },
      { x: 10, y: 2 },
      { x: 11, y: 2 },
      { x: 12, y: 2 },
      { x: 13, y: 2 },
      { x: 14, y: 2 },
      { x: 10, y: 1 },
      { x: 10, y: 3 },
    ]
  ) {
    memory[indexForPoint(map.width, point)] = "water"
  }

  return {
    map,
    player: { x: 1, y: 1 },
    seed: "scout-exploration-frontier-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory,
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 10, y: 2 },
      archetype: "scout",
      target: null,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createPlayerSonarAlertGame(): GameState {
  const map = createMapFromRows(
    [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    { x: 1, y: 2 },
    { x: 18, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "player-sonar-alert-test",
    turn: 1,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    shockwaves: [{
      origin: { x: 2, y: 2 },
      radius: 8,
      senderId: "player",
      damaging: false,
      revealTerrain: true,
      revealEntities: true,
    }],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [
      createHostile({
        id: "hostile-1",
        position: { x: 10, y: 1 },
        archetype: "hunter",
        lastSonarTurn: 1,
      }),
      createHostile({
        id: "hostile-2",
        position: { x: 14, y: 2 },
        archetype: "hunter",
        lastSonarTurn: 1,
      }),
    ],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createPlayerSonarCueHostileGame(): GameState {
  const map = createMapFromRows(
    [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    { x: 1, y: 2 },
    { x: 18, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "player-sonar-cue-hostile-test",
    turn: 1,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    shockwaves: [{
      origin: { x: 2, y: 2 },
      radius: 8,
      senderId: "player",
      damaging: false,
      revealTerrain: true,
      revealEntities: true,
    }],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 11, y: 2 },
      archetype: "scout",
      lastSonarTurn: 1,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createReversedPlayerSonarAlertGame(): GameState {
  const game = createPlayerSonarAlertGame()

  return {
    ...game,
    hostileSubmarines: [
      {
        ...game.hostileSubmarines[1],
        position: { ...game.hostileSubmarines[1].position },
      },
      {
        ...game.hostileSubmarines[0],
        position: { ...game.hostileSubmarines[0].position },
      },
    ],
  }
}

function createBlockedPlayerSonarAlertGame(): GameState {
  const map = createMapFromRows(
    [
      "####################",
      "#........#.........#",
      "#........#.........#",
      "#........#.........#",
      "####################",
    ],
    { x: 1, y: 2 },
    { x: 18, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "blocked-player-sonar-alert-test",
    turn: 1,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    shockwaves: [{
      origin: { x: 2, y: 2 },
      radius: 8,
      senderId: "player",
      damaging: false,
      revealTerrain: true,
      revealEntities: true,
    }],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 14, y: 2 },
      archetype: "hunter",
      lastSonarTurn: 1,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createTurtleRelayGame(): GameState {
  const game = createPlayerSonarAlertGame()

  return {
    ...game,
    hostileSubmarines: [
      createHostile({
        id: "hostile-1",
        position: { x: 10, y: 2 },
        archetype: "hunter",
        lastSonarTurn: 1,
      }),
      createHostile({
        id: "hostile-2",
        position: { x: 14, y: 1 },
        archetype: "turtle",
        lastSonarTurn: 1,
      }),
    ],
  }
}

function createEnemySonarVisibilityGame(blocked: boolean): GameState {
  const rows = blocked
    ? [
      "###########",
      "#....#....#",
      "#....#....#",
      "#.........#",
      "###########",
    ]
    : [
      "###########",
      "#.........#",
      "#.........#",
      "#.........#",
      "###########",
    ]
  const map = createMapFromRows(rows, { x: 1, y: 2 }, { x: 9, y: 2 })

  return {
    map,
    player: { x: 2, y: 2 },
    seed: blocked ? "enemy-sonar-hidden-test" : "enemy-sonar-visible-test",
    turn: 4,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: blocked ? { x: 8, y: 1 } : { x: 8, y: 2 },
      archetype: "hunter",
      lastSonarTurn: 0,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    playerSonarEnabled: false,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createEnemySonarContactGame(): GameState {
  const map = createMapFromRows(
    [
      "###########",
      "#.........#",
      "#.........#",
      "#.........#",
      "###########",
    ],
    { x: 1, y: 2 },
    { x: 9, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "enemy-sonar-contact-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    hostileSonarContactCueCount: 0,
    shockwaves: [{
      origin: { x: 8, y: 2 },
      radius: 4,
      senderId: "hostile-1",
      damaging: false,
      revealTerrain: false,
      revealEntities: false,
    }],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    hostileSubmarines: [createHostile({
      id: "hostile-1",
      position: { x: 8, y: 2 },
      archetype: "turtle",
      lastSonarTurn: 1,
    })],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    playerSonarEnabled: false,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createNonHostileShockwaveGame(): GameState {
  const game = createEnemySonarContactGame()

  return {
    ...game,
    seed: "non-hostile-shockwave-test",
    shockwaves: [{
      origin: { x: 8, y: 2 },
      radius: 4,
      senderId: "fish-1",
      damaging: false,
      revealTerrain: false,
      revealEntities: false,
    }],
  }
}

function createEnemyExplosionVisibilityGame(): GameState {
  const map = createMapFromRows(
    [
      "###########",
      "#.........#",
      "#.........#",
      "#.........#",
      "###########",
    ],
    { x: 1, y: 2 },
    { x: 9, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "enemy-explosion-hidden-test",
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => 0).map(() =>
      null
    ),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    shockwaves: [{
      origin: { x: 8, y: 2 },
      radius: 0,
      senderId: "hostile-1",
      damaging: true,
      revealTerrain: false,
      revealEntities: false,
    }],
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
    logs: [],
  }
}

function createHostile(
  options: {
    id: string
    position: Point
    archetype: "scout" | "hunter" | "turtle" | "guard"
    target?: Point | null
    lastKnownPlayerPosition?: Point | null
    lastKnownPlayerTurn?: number | null
    lastSonarTurn?: number
    previousPosition?: Point | null
  },
): GameState["hostileSubmarines"][number] {
  const loadout = options.archetype === "scout"
    ? { torpedoAmmo: 2, vlsAmmo: 2, depthChargeAmmo: 2 }
    : options.archetype === "guard"
    ? { torpedoAmmo: 4, vlsAmmo: 4, depthChargeAmmo: 4 }
    : options.archetype === "turtle"
    ? { torpedoAmmo: 4, vlsAmmo: 4, depthChargeAmmo: 4 }
    : { torpedoAmmo: 6, vlsAmmo: 6, depthChargeAmmo: 6 }

  return {
    id: options.id,
    position: options.position,
    initialPosition: { ...options.position },
    facing: "left",
    mode: options.archetype === "turtle" || options.archetype === "guard"
      ? "patrol"
      : "attack",
    target: options.target ?? null,
    reload: 0,
    archetype: options.archetype,
    torpedoAmmo: loadout.torpedoAmmo,
    vlsAmmo: loadout.vlsAmmo,
    depthChargeAmmo: loadout.depthChargeAmmo,
    lastSonarTurn: options.lastSonarTurn ?? 0,
    lastKnownPlayerPosition: options.lastKnownPlayerPosition ?? null,
    lastKnownPlayerVector: null,
    lastKnownPlayerTurn: options.lastKnownPlayerTurn ?? null,
    previousPosition: options.previousPosition ?? null,
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
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
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
    logs: [],
  }
}

function hasKnownTileBeyondPassiveRange(game: GameState): boolean {
  return game.memory.some((tile, index) => {
    if (tile === null) {
      return false
    }

    const x = index % game.map.width
    const y = Math.floor(index / game.map.width)
    return Math.max(Math.abs(x - game.player.x), Math.abs(y - game.player.y)) >
      2
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
