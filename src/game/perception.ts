import { PASSIVE_DETECTED_RADIUS, PASSIVE_EXACT_RADIUS } from "./constants.ts"
import { chebyshevDistance } from "./helpers.ts"
import type { GameState, VisibilityLevel } from "./model.ts"
import { tileAt, type TileKind } from "./mapgen.ts"

export function refreshPerception(
  game: GameState,
  sonarReveals: Array<{ index: number; tile: TileKind }>,
): GameState {
  const memory = game.memory.slice()
  const visibility = Array.from(
    { length: game.map.tiles.length },
    () => 0 as VisibilityLevel,
  )

  const capsuleKnown = game.capsuleKnown || game.status === "won" ||
    chebyshevDistance(game.player, game.map.capsule) <= PASSIVE_EXACT_RADIUS

  for (let y = 0; y < game.map.height; y += 1) {
    for (let x = 0; x < game.map.width; x += 1) {
      const tile = tileAt(game.map, x, y)

      if (!tile) {
        continue
      }

      const index = y * game.map.width + x
      const distance = chebyshevDistance(game.player, { x, y })

      if (distance <= PASSIVE_EXACT_RADIUS) {
        memory[index] = tile
        setVisibility(visibility, index, 3)
        continue
      }

      if (distance <= PASSIVE_DETECTED_RADIUS) {
        memory[index] = tile
        setVisibility(visibility, index, 2)
      }
    }
  }

  for (const reveal of sonarReveals) {
    memory[reveal.index] = reveal.tile
    setVisibility(visibility, reveal.index, 1)
  }

  return {
    ...game,
    capsuleKnown,
    memory,
    visibility,
  }
}

function setVisibility(
  visibility: VisibilityLevel[],
  index: number,
  level: VisibilityLevel,
): void {
  if (visibility[index] < level) {
    visibility[index] = level
  }
}
