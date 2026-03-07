import type { CrackCell } from "../../game/game.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph, drawTileBackground } from "../helpers/draw.ts"

export function drawEffectsLayer(
  context: CanvasRenderingContext2D,
  tileSize: number,
  screenX: number,
  screenY: number,
  index: number,
  effectMaps: {
    trails: Map<number, number>
    dust: Map<number, number>
    sonarFront: Map<number, number>
    cracks: Map<number, CrackCell>
  },
): void {
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

export function drawSonarLayer(
  context: CanvasRenderingContext2D,
  tileSize: number,
  screenX: number,
  screenY: number,
  index: number,
  effectMaps: {
    dust: Map<number, number>
    sonarFront: Map<number, number>
  },
): void {
  const dustAlpha = effectMaps.dust.get(index) ?? 0
  const sonarAlpha = (effectMaps.sonarFront.get(index) ?? 0) * Math.max(0.1, 1 - dustAlpha * 0.85)

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
