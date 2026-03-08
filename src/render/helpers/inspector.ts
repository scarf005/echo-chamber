import { exactEntityNameAtPoint } from "../../game/entity_labels.ts"
import type { GameState } from "../../game/game.ts"
import type { Point } from "../../game/mapgen.ts"

export function describeInspectorContact(
  game: GameState,
  point: Point,
): string | null {
  const index = point.y * game.map.width + point.x

  if (hasExactInspectorVisibility(game, point)) {
    return exactEntityNameAtPoint(game, point) ?? null
  }

  return normalizeInspectorContact(game.entityMemory?.[index] ?? null)
}

export function hasExactInspectorVisibility(
  game: GameState,
  point: Point,
): boolean {
  const index = point.y * game.map.width + point.x
  return (game.visibility[index] ?? 0) >= 3
}

function normalizeInspectorContact(contact: string | null): string | null {
  return contact === "enemy" ? "entity" : contact
}
