import { PASSIVE_DETECTED_RADIUS, PASSIVE_EXACT_RADIUS } from "./constants.ts"
import { chebyshevDistance, indexForPoint } from "./helpers.ts"
import type {
  EntityMemoryKind,
  EntityReveal,
  GameState,
  TileReveal,
  VisibilityLevel,
} from "./model.ts"
import { tileAt } from "./mapgen.ts"

export const refreshPerception = (
  game: GameState,
  tileReveals: TileReveal[],
  entityReveals: EntityReveal[],
): GameState => {
  const memory = game.memory.slice()
  const entityMemory = game.entityMemory?.slice() ?? Array.from(
    { length: game.map.tiles.length },
    () => null,
  )
  const visibility = Array.from(
    { length: game.map.tiles.length },
    () => 0 as VisibilityLevel,
  )

  const capsuleCollected = game.capsuleCollected ?? false
  let capsuleKnown = capsuleCollected || game.capsuleKnown ||
    game.status === "won" ||
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
        clearEntityMemory(entityMemory, index)
        setVisibility(visibility, index, 3)
        continue
      }

      if (distance <= PASSIVE_DETECTED_RADIUS) {
        memory[index] = tile
        clearEntityMemory(entityMemory, index)
        setVisibility(visibility, index, 2)
      }
    }
  }

  for (const reveal of tileReveals) {
    memory[reveal.index] = reveal.tile
    clearEntityMemory(entityMemory, reveal.index)
    setVisibility(visibility, reveal.index, 1)
  }

  for (const reveal of entityReveals) {
    if (reveal.kind === "capsule") {
      capsuleKnown = true
    }

    if (isRememberedEntity(reveal.kind)) {
      entityMemory[reveal.index] = reveal.kind
    }

    setVisibility(visibility, reveal.index, 1)
  }

  for (const pickup of game.pickups) {
    rememberVisibleEntity(
      entityMemory,
      visibility,
      game.map.width,
      pickup.position,
      "item",
    )
  }

  for (const fish of game.fish ?? []) {
    rememberVisibleEntity(
      entityMemory,
      visibility,
      game.map.width,
      fish.position,
      "non-hostile",
    )
  }

  for (const hostileSubmarine of game.hostileSubmarines) {
    rememberVisibleEntity(
      entityMemory,
      visibility,
      game.map.width,
      hostileSubmarine.position,
      "enemy",
    )
  }

  return {
    ...game,
    capsuleKnown,
    memory,
    entityMemory,
    visibility,
  }
}

export const revealMap = (game: GameState): GameState => {
  return {
    ...game,
    capsuleKnown: true,
    memory: game.map.tiles.slice(),
    visibility: Array.from(
      { length: game.map.tiles.length },
      () => 1 as VisibilityLevel,
    ),
  }
}

const clearEntityMemory = (
  entityMemory: Array<EntityMemoryKind | null>,
  index: number,
): void => {
  entityMemory[index] = null
}

const isRememberedEntity = (
  kind: EntityReveal["kind"],
): kind is Extract<EntityMemoryKind, EntityReveal["kind"]> => {
  return kind === "item" || kind === "enemy" || kind === "non-hostile"
}

const rememberVisibleEntity = (
  entityMemory: Array<EntityMemoryKind | null>,
  visibility: VisibilityLevel[],
  width: number,
  position: { x: number; y: number },
  kind: EntityMemoryKind,
): void => {
  const index = indexForPoint(width, position)

  if (visibility[index] >= 2) {
    entityMemory[index] = kind
  }
}

const setVisibility = (
  visibility: VisibilityLevel[],
  index: number,
  level: VisibilityLevel,
): void => {
  if (visibility[index] < level) {
    visibility[index] = level
  }
}
