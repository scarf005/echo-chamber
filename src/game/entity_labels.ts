import type { GameState } from "./game.ts"
import type { Point } from "./mapgen.ts"

export function exactEntityNameAtPoint(
  game: GameState,
  point: Point,
): string | null {
  if (point.x === game.player.x && point.y === game.player.y) {
    return "player submarine"
  }

  if (point.x === game.map.capsule.x && point.y === game.map.capsule.y) {
    return "capsule"
  }

  if (game.hostileSubmarines.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return "enemy submarine"
  }

  if ((game.fish ?? []).some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return "fish"
  }

  if (game.pickups.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return "item"
  }

  if (game.torpedoes.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return "torpedo"
  }

  if (game.depthCharges.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return "depth charge"
  }

  if (game.fallingBoulders.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return "falling boulder"
  }

  return null
}

export function inSightReasonForEntity(name: string): string {
  return `${name} in sight`
}
