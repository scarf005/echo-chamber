import { t } from "@lingui/core/macro"
import type { GameState } from "./game.ts"
import type { Point } from "./mapgen.ts"

export function exactEntityNameAtPoint(
  game: GameState,
  point: Point,
): string | null {
  if (point.x === game.player.x && point.y === game.player.y) {
    return t`player submarine`
  }

  if (point.x === game.map.capsule.x && point.y === game.map.capsule.y) {
    return t`capsule`
  }

  if (game.hostileSubmarines.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return t`enemy submarine`
  }

  if ((game.fish ?? []).some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return t`fish`
  }

  if (game.pickups.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return t`item`
  }

  if (game.torpedoes.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return t`torpedo`
  }

  if (game.depthCharges.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return t`depth charge`
  }

  if (game.fallingBoulders.some((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )) {
    return t`falling boulder`
  }

  return null
}

export function inSightReasonForEntity(name: string): string {
  return t`${name} in sight`
}
