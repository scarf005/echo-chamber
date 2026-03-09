import { i18n } from "../i18n.ts"
import type { GameState } from "./game.ts"
import type { Point } from "./mapgen.ts"

export const exactEntityNameAtPoint = (
  game: GameState,
  point: Point,
): string | null => {
  if (point.x === game.player.x && point.y === game.player.y) {
    return i18n._("player submarine")
  }

  if (point.x === game.map.capsule.x && point.y === game.map.capsule.y) {
    return i18n._("capsule")
  }

  if (
    game.hostileSubmarines.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    return i18n._("enemy submarine")
  }

  if (
    (game.fish ?? []).some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    return i18n._("fish")
  }

  if (
    game.pickups.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    return i18n._("item")
  }

  if (
    game.torpedoes.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    return i18n._("torpedo")
  }

  if (
    game.depthCharges.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    return i18n._("depth charge")
  }

  if (
    game.fallingBoulders.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    return i18n._("falling boulder")
  }

  return null
}

export const inSightReasonForEntity = (name: string): string => {
  return i18n._("{name} in sight", { name })
}
