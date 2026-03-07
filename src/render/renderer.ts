import type { CrackCell, GameState } from "../game/game.ts"
import { COLORS } from "./colors.ts"
import { calculateTileSize, screenShakeOffset } from "./helpers/draw.ts"
import { buildEntityMaps, indexAlphaMap, indexCrackMap } from "./helpers/selectors.ts"
import { drawEntitiesLayer } from "./layers/entities.ts"
import { drawEffectsLayer, drawSonarLayer } from "./layers/effects.ts"
import { drawTileMemoryLayer } from "./layers/tileMemory.ts"

export function drawGame(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  game: GameState,
): void {
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("2D canvas not supported")
  }

  const tileSize = calculateTileSize(container, game)
  const cssWidth = tileSize * game.map.width
  const cssHeight = tileSize * game.map.height
  const devicePixelRatio = window.devicePixelRatio || 1

  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  canvas.width = Math.max(1, Math.floor(cssWidth * devicePixelRatio))
  canvas.height = Math.max(1, Math.floor(cssHeight * devicePixelRatio))

  const shake = screenShakeOffset(game)
  context.setTransform(
    devicePixelRatio,
    0,
    0,
    devicePixelRatio,
    shake.x * devicePixelRatio,
    shake.y * devicePixelRatio,
  )
  context.clearRect(-tileSize, -tileSize, cssWidth + tileSize * 2, cssHeight + tileSize * 2)
  context.fillStyle = COLORS.background
  context.fillRect(-tileSize, -tileSize, cssWidth + tileSize * 2, cssHeight + tileSize * 2)
  context.font = `${Math.max(8, tileSize - 2)}px "IBM Plex Mono", monospace`
  context.textAlign = "center"
  context.textBaseline = "middle"

  const effectMaps: {
    trails: Map<number, number>
    dust: Map<number, number>
    sonarFront: Map<number, number>
    cracks: Map<number, CrackCell>
  } = {
    sonarFront: indexAlphaMap(game.sonarFront),
    trails: indexAlphaMap(game.trails),
    dust: indexAlphaMap(game.dust),
    cracks: indexCrackMap(game.cracks),
  }
  const entityMaps = buildEntityMaps(game)

  for (let y = 0; y < game.map.height; y += 1) {
    for (let x = 0; x < game.map.width; x += 1) {
      const index = y * game.map.width + x
      const screenX = x * tileSize
      const screenY = y * tileSize

      drawTileMemoryLayer(context, game, index, x, y, tileSize)
      drawEffectsLayer(context, tileSize, screenX, screenY, index, effectMaps)
      drawEntitiesLayer(context, game, tileSize, screenX, screenY, x, y, index, entityMaps)
      drawSonarLayer(context, tileSize, screenX, screenY, index, effectMaps)
    }
  }
}
