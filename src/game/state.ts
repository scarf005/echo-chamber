import {
  DEFAULT_HOSTILE_SUBMARINE_COUNT,
  START_DEPTH_CHARGES,
  START_TORPEDOES,
} from "./constants.ts"
import { createInitialLogs, createInitialMissionMessage } from "./log.ts"
import { createCornerPickups } from "./items.ts"
import type { GameOptions, GameState } from "./model.ts"
import { refreshPerception } from "./perception.ts"
import { generateMap } from "./mapgen.ts"
import { spawnFish } from "./systems/fish.ts"
import { spawnHostileSubmarines } from "./systems/hostiles.ts"

export const createGame = (options: GameOptions = {}): GameState => {
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
  const fish = spawnFish(map, map.seed, hostileSubmarines)
  const occupiedByHostiles = new Set(
    hostileSubmarines.map((hostileSubmarine) =>
      `${hostileSubmarine.position.x}:${hostileSubmarine.position.y}`
    ),
  )
  const occupiedByFish = new Set(
    fish.map((candidate) => `${candidate.position.x}:${candidate.position.y}`),
  )
  const pickups = createCornerPickups(map, map.seed).filter((pickup) =>
    !occupiedByHostiles.has(`${pickup.position.x}:${pickup.position.y}`) &&
    !occupiedByFish.has(`${pickup.position.x}:${pickup.position.y}`)
  )
  const game: GameState = {
    map,
    player: { ...map.spawn },
    seed: map.seed,
    turn: 0,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    capsuleCollected: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from(
      { length: map.tiles.length },
      () => 0,
    ),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    playerSonarContactAudioVariant: null,
    hostileSonarContactCueCount: 0,
    playerEntityHitCueCount: 0,
    playerDeathCueCount: 0,
    playerPickupCueCount: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups,
    fish,
    hostileSubmarines,
    trails: [],
    dust: [],
    cracks: [],
    structuralDamage: Array.from({ length: map.tiles.length }, () => 0),
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: START_TORPEDOES,
    depthChargeAmmo: START_DEPTH_CHARGES,
    screenShake: 0,
    message: createInitialMissionMessage(),
    logs: createInitialLogs(),
  }

  return refreshPerception(game, [], [])
}
