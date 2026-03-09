import type { GameState } from "../../game/game.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph, drawTileBackground } from "../helpers/draw.ts"
import { wallGlyphForMask } from "../helpers/selectors.ts"

export type DrawTileMemoryLayerOptions = {
  context: CanvasRenderingContext2D
  game: GameState
  index: number
  screenX: number
  screenY: number
  x: number
  y: number
  tileSize: number
}

export const drawTileMemoryLayer = ({ context, game, index, screenX, screenY, x, y, tileSize }: DrawTileMemoryLayerOptions): void => {
  const visibility = game.visibility[index]
  const memory = game.memory[index]

  if (memory === "wall") {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: visibility >= 2 ? COLORS.visibleWall : COLORS.memoryWall,
      alpha: 1,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: wallGlyphForMask({ game, x, y }),
      color: COLORS.background,
      alpha: visibility >= 2 ? 0.92 : 0.65,
    })
  } else if (memory === "water") {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      alpha: visibility >= 2 ? 0.14 : 0.08,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: visibility >= 2 ? "." : "·",
      color: visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      alpha: visibility >= 2 ? 0.8 : 0.42,
    })
  } else if (memory === "kelp") {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      alpha: visibility >= 2 ? 0.18 : 0.1,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: '"',
      color: visibility >= 2 ? "#5fe08f" : "#2d7a52",
      alpha: visibility >= 2 ? 0.92 : 0.66,
    })
  } else if (memory === "vent") {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: visibility >= 2 ? COLORS.visibleWater : COLORS.memoryWater,
      alpha: visibility >= 2 ? 0.22 : 0.12,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: "!",
      color: visibility >= 2 ? COLORS.vent : COLORS.ventDim,
      alpha: visibility >= 2 ? 0.96 : 0.74,
    })
  }
}
