import { exactEntityNameAtPoint } from "../../game/entity_labels.ts"
import type { GameState } from "../../game/game.ts"
import type { Point } from "../../game/mapgen.ts"

export function describeInspectorContact(
  game: GameState,
  point: Point,
): string | null {
  const index = point.y * game.map.width + point.x

  return exactEntityNameAtPoint(game, point) ?? game.entityMemory?.[index] ?? null
}
