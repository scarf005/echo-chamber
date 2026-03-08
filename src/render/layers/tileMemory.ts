import type { GameState } from "../../game/game.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph, drawTileBackground } from "../helpers/draw.ts"
import { wallGlyphForMask } from "../helpers/selectors.ts"

export function drawTileMemoryLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  index: number,
  x: number,
  y: number,
  tileSize: number,
): void {
  const visibility = game.visibility[index]
  const memory = game.memory[index]
  const screenX = x * tileSize
  const screenY = y * tileSize

  if (memory === "wall") {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      visibility >= 2 ? COLORS.visibleWall : COLORS.memoryWall,
      1,
    )
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      wallGlyphForMask(game, x, y),
      COLORS.background,
      visibility >= 2 ? 0.92 : 0.65,
    )
  } else if (memory === "water") {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      visibility >= 2 ? 0.14 : 0.08,
    )
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      visibility >= 2 ? "." : "·",
      visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      visibility >= 2 ? 0.8 : 0.42,
    )
  } else if (memory === "kelp") {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      visibility >= 2 ? 0.18 : 0.1,
    )
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      '"',
      visibility >= 2 ? "#5fe08f" : "#2d7a52",
      visibility >= 2 ? 0.92 : 0.66,
    )
  }
}
