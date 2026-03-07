import type { CrackCell, FadeCell, GameState } from "../game/game.ts"
import type { Point } from "../game/mapgen.ts"
import { COLORS } from "./colors.ts"
import { TERMINAL_FONT_STACK } from "./fontFamily.ts"
import { calculateTileSize, screenShakeOffset } from "./helpers/draw.ts"
import type { RenderOptions } from "./options.ts"
import {
  buildEntityMaps,
  indexAlphaMap,
  indexCrackMap,
  indexFadeMap,
} from "./helpers/selectors.ts"
import { drawEntitiesLayer } from "./layers/entities.ts"
import { drawEffectsLayer, drawShockwaveLayer } from "./layers/effects.ts"
import { drawTileMemoryLayer } from "./layers/tileMemory.ts"

export function drawGame(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  game: GameState,
  selectedTarget: Point | null = null,
  previewPath: Point[] = [],
  renderOptions: RenderOptions = {},
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
  context.clearRect(
    -tileSize,
    -tileSize,
    cssWidth + tileSize * 2,
    cssHeight + tileSize * 2,
  )
  context.fillStyle = COLORS.background
  context.fillRect(
    -tileSize,
    -tileSize,
    cssWidth + tileSize * 2,
    cssHeight + tileSize * 2,
  )
  context.font = `${Math.max(8, tileSize - 2)}px ${TERMINAL_FONT_STACK}`
  context.textAlign = "center"
  context.textBaseline = "middle"

  const effectMaps: {
    trails: Map<number, number>
    dust: Map<number, number>
    shockwaveFront: Map<number, FadeCell>
    cracks: Map<number, CrackCell>
  } = {
    shockwaveFront: indexFadeMap(game.shockwaveFront),
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
      drawEffectsLayer(
        context,
        game,
        tileSize,
        screenX,
        screenY,
        index,
        effectMaps,
      )
      drawEntitiesLayer(
        context,
        game,
        renderOptions,
        tileSize,
        screenX,
        screenY,
        x,
        y,
        index,
        entityMaps,
      )
      drawShockwaveLayer(
        context,
        game,
        tileSize,
        screenX,
        screenY,
        index,
        effectMaps,
      )
    }
  }

  if (previewPath.length > 1) {
    drawPathPreview(context, previewPath, tileSize)
  }

  if (renderOptions.debugPlannedPaths) {
    drawHostilePlannedPaths(context, game, tileSize)
  }

  if (selectedTarget) {
    drawTargetHighlight(context, selectedTarget, tileSize)
  }
}

function drawPathPreview(
  context: CanvasRenderingContext2D,
  previewPath: Point[],
  tileSize: number,
): void {
  context.save()
  context.strokeStyle = COLORS.sonar
  context.globalAlpha = 0.75
  context.lineWidth = Math.max(1, tileSize * 0.16)
  context.beginPath()

  for (let index = 0; index < previewPath.length; index += 1) {
    const point = previewPath[index]
    const centerX = point.x * tileSize + tileSize / 2
    const centerY = point.y * tileSize + tileSize / 2

    if (index === 0) {
      context.moveTo(centerX, centerY)
    } else {
      context.lineTo(centerX, centerY)
    }
  }

  context.stroke()

  context.restore()
}

function drawTargetHighlight(
  context: CanvasRenderingContext2D,
  target: Point,
  tileSize: number,
): void {
  const inset = Math.max(1, tileSize * 0.12)
  const lineWidth = Math.max(1, tileSize * 0.08)
  const x = target.x * tileSize + inset
  const y = target.y * tileSize + inset
  const size = Math.max(1, tileSize - inset * 2)

  context.save()
  context.strokeStyle = COLORS.player
  context.lineWidth = lineWidth
  context.shadowColor = COLORS.sonarGlow
  context.shadowBlur = tileSize * 0.4
  context.strokeRect(x, y, size, size)
  context.beginPath()
  context.moveTo(x + size / 2, y + lineWidth)
  context.lineTo(x + size / 2, y + size - lineWidth)
  context.moveTo(x + lineWidth, y + size / 2)
  context.lineTo(x + size - lineWidth, y + size / 2)
  context.stroke()
  context.restore()
}

function drawHostilePlannedPaths(
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
): void {
  context.save()
  context.strokeStyle = COLORS.hostileSubmarine
  context.globalAlpha = 0.35
  context.lineWidth = Math.max(1, tileSize * 0.12)

  for (const hostileSubmarine of game.hostileSubmarines) {
    const path = hostileSubmarine.plannedPath ?? []

    if (path.length < 2) {
      continue
    }

    context.beginPath()

    for (let index = 0; index < path.length; index += 1) {
      const point = path[index]
      const centerX = point.x * tileSize + tileSize / 2
      const centerY = point.y * tileSize + tileSize / 2

      if (index === 0) {
        context.moveTo(centerX, centerY)
      } else {
        context.lineTo(centerX, centerY)
      }
    }

    context.stroke()
  }

  context.restore()
}
