import type {
  CrackCell,
  DepthCharge,
  FadeCell,
  FallingBoulder,
  GameState,
  Torpedo,
} from "../../game/game.ts"

export function indexAlphaMap(cells: FadeCell[]): Map<number, number> {
  const result = new Map<number, number>()

  for (const cell of cells) {
    result.set(cell.index, Math.max(result.get(cell.index) ?? 0, cell.alpha))
  }

  return result
}

export function indexCrackMap(cells: CrackCell[]): Map<number, CrackCell> {
  const result = new Map<number, CrackCell>()

  for (const cell of cells) {
    const current = result.get(cell.index)

    if (!current || cell.alpha > current.alpha) {
      result.set(cell.index, cell)
    }
  }

  return result
}

export function buildEntityMaps(game: GameState): {
  torpedoes: Map<number, Torpedo>
  depthCharges: Map<number, DepthCharge>
  boulders: Map<number, FallingBoulder>
} {
  return {
    torpedoes: buildEntityMap(game.torpedoes, game.map.width),
    depthCharges: buildEntityMap(game.depthCharges, game.map.width),
    boulders: buildEntityMap(game.fallingBoulders, game.map.width),
  }
}

function buildEntityMap<T extends { position: { x: number; y: number } }>(
  entities: T[],
  width: number,
): Map<number, T> {
  return entities.reduce((map, entity) => {
    map.set(entity.position.y * width + entity.position.x, entity)
    return map
  }, new Map<number, T>())
}

export function wallGlyphForMask(game: GameState, x: number, y: number): string {
  const mask = Number(isKnownWall(game, x, y - 1)) |
    (Number(isKnownWall(game, x + 1, y)) << 1) |
    (Number(isKnownWall(game, x, y + 1)) << 2) |
    (Number(isKnownWall(game, x - 1, y)) << 3)

  switch (mask) {
    case 0:
      return "■"
    case 1:
    case 4:
    case 5:
      return "│"
    case 2:
    case 8:
    case 10:
      return "─"
    case 3:
      return "└"
    case 6:
      return "┌"
    case 12:
      return "┐"
    case 9:
      return "┘"
    case 7:
      return "├"
    case 13:
      return "┤"
    case 14:
      return "┬"
    case 11:
      return "┴"
    default:
      return "┼"
  }
}

function isKnownWall(game: GameState, x: number, y: number): boolean {
  if (x < 0 || x >= game.map.width || y < 0 || y >= game.map.height) {
    return false
  }

  return game.memory[y * game.map.width + x] === "wall"
}
