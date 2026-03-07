import { deltaForDirection, horizontalFacingForMove } from "./helpers.ts"
import type { Direction, GameState, HorizontalDirection } from "./model.ts"
import { isPassableTile } from "./mapgen.ts"
import { advanceTurn } from "./turn.ts"
import { tileAt } from "./mapgen.ts"

export function directionFromKey(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up"
    case "ArrowDown":
    case "s":
    case "S":
      return "down"
    case "ArrowLeft":
    case "a":
    case "A":
      return "left"
    case "ArrowRight":
    case "d":
    case "D":
      return "right"
    default:
      return null
  }
}

export function movePlayer(game: GameState, direction: Direction): GameState {
  if (game.status !== "playing") {
    return game
  }

  const delta = deltaForDirection(direction)
  const target = {
    x: game.player.x + delta.x,
    y: game.player.y + delta.y,
  }

  if (!isPassableTile(tileAt(game.map, target.x, target.y))) {
    return {
      ...game,
      message: "Hull blocked.",
      facing: horizontalFacingForMove(game.facing, direction),
    }
  }

  return advanceTurn(
    game,
    target,
    horizontalFacingForMove(game.facing, direction),
    null,
    "Advance.",
  )
}

export function fireTorpedo(
  game: GameState,
  direction: HorizontalDirection = game.facing,
): GameState {
  if (game.status !== "playing") {
    return game
  }

  if (game.torpedoAmmo <= 0) {
    return {
      ...game,
      facing: direction,
      message: "No torpedoes remaining.",
    }
  }

  return advanceTurn(
    game,
    game.player,
    direction,
    { kind: "torpedo", direction },
    direction === "left" ? "Tube away to port." : "Tube away to starboard.",
  )
}

export function dropDepthCharge(game: GameState): GameState {
  if (game.status !== "playing") {
    return game
  }

  if (game.depthChargeAmmo <= 0) {
    return {
      ...game,
      message: "No depth charges remaining.",
    }
  }

  return advanceTurn(
    game,
    game.player,
    game.facing,
    { kind: "depth-charge" },
    "Depth charge away.",
  )
}
