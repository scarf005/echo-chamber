import type { CrackCell, FadeCell, GameState } from "../../game/game.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph, drawTileBackground } from "../helpers/draw.ts"

export function drawEffectsLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  screenX: number,
  screenY: number,
  index: number,
  effectMaps: {
    trails: Map<number, number>
    dust: Map<number, number>
    shockwaveFront: Map<number, FadeCell>
    cracks: Map<number, CrackCell>
  },
): void {
  if (game.visibility[index] === 0) {
    return
  }

  const trailAlpha = effectMaps.trails.get(index) ?? 0
  const dustAlpha = effectMaps.dust.get(index) ?? 0
  const crack = effectMaps.cracks.get(index)

  if (trailAlpha > 0) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      "~",
      COLORS.trail,
      trailAlpha,
    )
  }

  if (dustAlpha > 0) {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      COLORS.dustGlow,
      Math.min(0.72, dustAlpha * 0.65),
    )
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      "%",
      COLORS.dust,
      Math.min(1, dustAlpha),
    )
  }

  if (crack) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      crack.glyph,
      COLORS.crack,
      crack.alpha,
    )
  }
}

export function drawShockwaveLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  screenX: number,
  screenY: number,
  index: number,
  effectMaps: {
    dust: Map<number, number>
    shockwaveFront: Map<number, FadeCell>
  },
): void {
  const dustAlpha = effectMaps.dust.get(index) ?? 0
  const front = effectMaps.shockwaveFront.get(index)

  if (!front || (front.requiresVisibility && game.visibility[index] === 0)) {
    return
  }

  const sonarAlpha = front.alpha * Math.max(0.1, 1 - dustAlpha * 0.85)

  if (sonarAlpha <= 0) {
    return
  }

  drawTileBackground(
    context,
    screenX,
    screenY,
    tileSize,
    COLORS.sonarGlow,
    sonarAlpha * 0.5,
  )
  drawGlyph(
    context,
    screenX,
    screenY,
    tileSize,
    "◌",
    COLORS.sonar,
    sonarAlpha,
  )
}
