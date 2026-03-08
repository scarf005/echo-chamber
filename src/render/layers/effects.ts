import type { CrackCell, FadeCell, GameState } from "../../game/game.ts"
import type { LightCell } from "../lighting.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph, drawTileBackground } from "../helpers/draw.ts"

export function resolveTrailColor(trail?: FadeCell): string {
  return trail?.source === "enemy-projectile"
    ? COLORS.enemyProjectileTrail
    : COLORS.trail
}

export function drawEffectsLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  screenX: number,
  screenY: number,
  index: number,
  effectMaps: {
    trails: Map<number, FadeCell>
    dust: Map<number, number>
    shockwaveFront: Map<number, FadeCell>
    cracks: Map<number, CrackCell>
    ventLight: Map<number, LightCell>
  },
): void {
  const ventLight = effectMaps.ventLight.get(index)

  if (ventLight && shouldDrawVentLight(game, index)) {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      ventLight.color,
      ventLight.alpha,
    )
  }

  const trail = effectMaps.trails.get(index)

  if (!shouldDrawTrail(game, index, trail)) {
    return
  }

  const trailAlpha = trail?.alpha ?? 0
  const dustAlpha = effectMaps.dust.get(index) ?? 0
  const crack = effectMaps.cracks.get(index)

  if (trailAlpha > 0) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      "~",
      resolveTrailColor(trail),
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

export function shouldDrawVentLight(game: GameState, index: number): boolean {
  return shouldRevealEffectsOnDeath(game) || game.visibility[index] > 0
}

export function shouldDrawTrail(
  game: GameState,
  index: number,
  trail?: FadeCell,
): boolean {
  return shouldRevealEffectsOnDeath(game) || game.visibility[index] > 0 ||
    trail?.visibleToPlayer === true
}

export function shouldRevealEffectsOnDeath(game: GameState): boolean {
  return game.status === "lost"
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
  showHiddenEnemySonar = false,
): void {
  const dustAlpha = effectMaps.dust.get(index) ?? 0
  const front = effectMaps.shockwaveFront.get(index)

  if (!front) {
    return
  }

  const hiddenEnemySonar = front.requiresVisibility && game.visibility[index] === 0

  if (hiddenEnemySonar && !showHiddenEnemySonar && !shouldRevealEffectsOnDeath(game)) {
    return
  }

  const enemySonar = front.requiresVisibility === true
  const sonarColor = enemySonar ? COLORS.enemySonar : COLORS.sonar
  const sonarGlow = enemySonar ? COLORS.enemySonarGlow : COLORS.sonarGlow

  const sonarAlpha = front.alpha * Math.max(0.1, 1 - dustAlpha * 0.85) *
    (hiddenEnemySonar ? 0.72 : 1)

  if (sonarAlpha <= 0) {
    return
  }

  drawTileBackground(
    context,
    screenX,
    screenY,
    tileSize,
    sonarGlow,
    sonarAlpha * 0.5,
  )
  drawGlyph(
    context,
    screenX,
    screenY,
    tileSize,
    "◌",
    sonarColor,
    sonarAlpha,
  )
}
