import {
  DEFAULT_HOSTILE_SUBMARINE_COUNT,
  START_DEPTH_CHARGES,
  START_TORPEDOES,
} from "./constants.ts"
import { createCornerPickups } from "./items.ts"
import type { GameOptions, GameState } from "./model.ts"
import { refreshPerception } from "./perception.ts"
import { generateMap } from "./mapgen.ts"
import { spawnHostileSubmarines } from "./systems/hostiles.ts"

export function createGame(options: GameOptions = {}): GameState {
  const map = generateMap({
    width: options.width ?? 144,
    height: options.height ?? 84,
    seed: options.seed,
    smoothingIterations: 4,
    topology: 8,
    wallProbability: 0.45,
  })
  const hostileSubmarines = spawnHostileSubmarines(
    map,
    map.seed,
    options.hostileSubmarineCount ?? DEFAULT_HOSTILE_SUBMARINE_COUNT,
  )
  const occupiedByHostiles = new Set(
    hostileSubmarines.map((hostileSubmarine) =>
      `${hostileSubmarine.position.x}:${hostileSubmarine.position.y}`
    ),
  )
  const pickups = createCornerPickups(map, map.seed).filter((pickup) =>
    !occupiedByHostiles.has(`${pickup.position.x}:${pickup.position.y}`)
  )
  const game: GameState = {
    map,
    player: { ...map.spawn },
    seed: map.seed,
    turn: 0,
    status: "playing",
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from(
      { length: map.tiles.length },
      () => 0,
    ),
    lastSonarTurn: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups,
    hostileSubmarines,
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: START_TORPEDOES,
    depthChargeAmmo: START_DEPTH_CHARGES,
    screenShake: 0,
    message: "Recover the capsule. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
  }

  return refreshPerception(game, [], [])
}

export function createRandomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}
