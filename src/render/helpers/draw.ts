import type { GameState } from "../../game/game.ts"

export const calculateTileSize = (container: HTMLDivElement, game: GameState): number => {
  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight
  return Math.max(
    8,
    Math.floor(Math.min(width / game.map.width, height / game.map.height)),
  )
}

export type DrawTileBackgroundOptions = {
  context: CanvasRenderingContext2D
  x: number
  y: number
  tileSize: number
  color: string
  alpha: number
}

export const drawTileBackground = ({ context, x, y, tileSize, color, alpha }: DrawTileBackgroundOptions): void => {
  const previousAlpha = context.globalAlpha
  const previousFillStyle = context.fillStyle
  context.globalAlpha = alpha
  context.fillStyle = color
  context.fillRect(x, y, tileSize, tileSize)
  context.fillStyle = previousFillStyle
  context.globalAlpha = previousAlpha
}

export type DrawGlyphOptions = {
  context: CanvasRenderingContext2D
  x: number
  y: number
  tileSize: number
  glyph: string
  color: string
  alpha: number
}

export const drawGlyph = ({ context, x, y, tileSize, glyph, color, alpha }: DrawGlyphOptions): void => {
  const previousAlpha = context.globalAlpha
  const previousFillStyle = context.fillStyle
  context.globalAlpha = alpha
  context.fillStyle = color
  context.fillText(glyph, x + tileSize / 2, y + tileSize / 2 + 1)
  context.fillStyle = previousFillStyle
  context.globalAlpha = previousAlpha
}

export const screenShakeOffset = (game: GameState): { x: number; y: number } => {
  if (game.screenShake <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: Math.sin(game.turn * 1.73 + game.screenShake) * game.screenShake * 1.6,
    y: Math.cos(game.turn * 2.11 + game.screenShake * 0.7) * game.screenShake *
      1.3,
  }
}
