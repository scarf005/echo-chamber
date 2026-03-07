import { MAX_TORPEDOES } from "./constants.ts"
import type { GameOptions, GameState } from "./model.ts"
import { refreshPerception } from "./perception.ts"
import { generateMap } from "./mapgen.ts"

export function createGame(options: GameOptions = {}): GameState {
  const map = generateMap({
    width: options.width ?? 144,
    height: options.height ?? 84,
    seed: options.seed,
    smoothingIterations: 4,
    topology: 8,
    wallProbability: 0.45,
  })
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
    sonarWaves: [],
    sonarFront: [],
    torpedoes: [],
    depthCharges: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoesRemaining: MAX_TORPEDOES,
    screenShake: 0,
    message: "Recover the capsule. Sonar cycles every 5 turns.",
  }

  return refreshPerception(game, [])
}

export function createRandomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}
