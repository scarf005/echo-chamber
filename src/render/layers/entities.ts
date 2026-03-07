import type { DepthCharge, GameState, Torpedo } from "../../game/game.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph } from "../helpers/draw.ts"

export function drawEntitiesLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  index: number,
  entityMaps: {
    torpedoes: Map<number, Torpedo>
    depthCharges: Map<number, DepthCharge>
    boulders: Map<number, { position: { x: number; y: number } }>
  },
): void {
  if (x === game.map.capsule.x && y === game.map.capsule.y && game.capsuleKnown) {
    drawGlyph(context, screenX, screenY, tileSize, "C", COLORS.capsule, 1)
  }

  const torpedo = entityMaps.torpedoes.get(index)
  if (torpedo) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      torpedo.direction === "left" ? "<" : ">",
      COLORS.torpedo,
      1,
    )
  }

  const depthCharge = entityMaps.depthCharges.get(index)
  if (depthCharge) {
    drawGlyph(context, screenX, screenY, tileSize, "v", COLORS.depthCharge, 1)
  }

  const boulder = entityMaps.boulders.get(index)
  if (boulder) {
    drawGlyph(context, screenX, screenY, tileSize, "O", COLORS.boulder, 1)
  }

  if (x === game.player.x && y === game.player.y) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      game.facing === "left" ? "◄" : "►",
      COLORS.player,
      1,
    )
  }
}
