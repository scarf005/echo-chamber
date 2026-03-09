/// <reference lib="deno.ns" />

import {
  createGame,
  findAutoMovePath,
  findPath,
  isAutoMoveNavigable,
} from "./game.ts"

const game = createGame({
  seed: "auto-move-bench",
  width: 72,
  height: 36,
  hostileSubmarineCount: 0,
})

const pickDestination = () => {
  for (let y = game.map.height - 1; y >= 0; y -= 1) {
    for (let x = game.map.width - 1; x >= 0; x -= 1) {
      const point = { x, y }

      if (
        (point.x !== game.player.x || point.y !== game.player.y) &&
        isAutoMoveNavigable(game, point)
      ) {
        return point
      }
    }
  }

  return { ...game.player }
}

const destination = pickDestination()

Deno.bench("auto-move path baseline astar", () => {
  findPath(
    game.map,
    game.player,
    destination,
    (point) => isAutoMoveNavigable(game, point),
  )
})

findAutoMovePath(game, destination)

Deno.bench("auto-move path cached lookup", () => {
  findAutoMovePath(game, destination)
})
