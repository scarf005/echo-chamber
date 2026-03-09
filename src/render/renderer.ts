import type { CrackCell, FadeCell, GameState } from "../game/game.ts"
import type { Point } from "../game/mapgen.ts"
import { COLORS } from "./colors.ts"
import { TERMINAL_FONT_STACK } from "./fontFamily.ts"
import {
  drawGlyph,
  drawTileBackground,
  screenShakeOffset,
} from "./helpers/draw.ts"
import {
  pointToViewport,
  resolveViewportMetrics,
  type ViewportMetrics,
} from "./helpers/viewport.ts"
import type { RenderOptions } from "./options.ts"
import {
  buildEntityMaps,
  indexAlphaMap,
  indexCrackMap,
  indexFadeMap,
} from "./helpers/selectors.ts"
import { buildVentLightMap, type LightCell } from "./lighting.ts"
import {
  colorForHostileSubmarine,
  drawEntitiesLayer,
  playerGlyphForFacing,
  resolveHostileEstimateOverlay,
} from "./layers/entities.ts"
import { drawEffectsLayer, drawShockwaveLayer } from "./layers/effects.ts"
import { drawTileMemoryLayer } from "./layers/tileMemory.ts"

type EffectMaps = {
  trails: Map<number, FadeCell>
  dust: Map<number, number>
  shockwaveFront: Map<number, FadeCell>
  cracks: Map<number, CrackCell>
  ventLight: Map<number, LightCell>
}

type EntityMaps = ReturnType<typeof buildEntityMaps>

const effectMapsCache = new WeakMap<GameState, EffectMaps>()
const entityMapsCache = new WeakMap<GameState, EntityMaps>()
const tileMemoryCanvasCache = new WeakMap<
  GameState,
  Map<string, HTMLCanvasElement>
>()

export const drawGame = (
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  game: GameState,
  selectedTarget: Point | null = null,
  previewPath: Point[] = [],
  renderOptions: RenderOptions = {},
): void => {
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("2D canvas not supported")
  }

  const viewport = resolveViewportMetrics({
    game,
    viewportSize: {
      width: container.clientWidth || globalThis.innerWidth,
      height: container.clientHeight || globalThis.innerHeight,
    },
    renderOptions,
  })
  const tileSize = viewport.tileSize
  const cssWidth = viewport.cssWidth
  const cssHeight = viewport.cssHeight
  const devicePixelRatio = globalThis.devicePixelRatio || 1
  const nextCanvasWidth = Math.max(1, Math.floor(cssWidth * devicePixelRatio))
  const nextCanvasHeight = Math.max(1, Math.floor(cssHeight * devicePixelRatio))

  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  if (canvas.width !== nextCanvasWidth || canvas.height !== nextCanvasHeight) {
    canvas.width = nextCanvasWidth
    canvas.height = nextCanvasHeight
  }

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

  const effectMaps = resolveEffectMaps(game)
  const entityMaps = resolveEntityMaps(game)
  const tileMemoryCanvas = resolveTileMemoryCanvas(game, viewport)
  const hostileEstimateOverlay = renderOptions.debugEntityOverlay
    ? resolveHostileEstimateOverlay(game, renderOptions.hoveredTile ?? null)
    : null

  context.drawImage(tileMemoryCanvas, 0, 0)

  for (let y = viewport.top; y < viewport.top + viewport.height; y += 1) {
    for (let x = viewport.left; x < viewport.left + viewport.width; x += 1) {
      const index = y * game.map.width + x
      const screenX = (x - viewport.left) * tileSize
      const screenY = (y - viewport.top) * tileSize

      drawEffectsLayer({
        context,
        game,
        tileSize,
        screenX,
        screenY,
        index,
        effectMaps,
      })
      drawEntitiesLayer({
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
      })
      drawShockwaveLayer({
        context,
        game,
        tileSize,
        screenX,
        screenY,
        index,
        effectMaps,
        showHiddenEnemySonar: renderOptions.debugEntityOverlay === true,
      })
    }
  }

  if (hostileEstimateOverlay) {
    drawHostileEstimateOverlays(
      context,
      game,
      tileSize,
      viewport,
      hostileEstimateOverlay.estimatedPositions,
      hostileEstimateOverlay.highlightedEstimatedPosition,
    )
  }

  if (previewPath.length > 1) {
    drawPathPreview(context, previewPath, viewport)
  }

  if (renderOptions.debugPlannedPaths) {
    drawHostilePlannedPaths(context, game, viewport)
  }

  if (selectedTarget) {
    drawTargetHighlight(context, selectedTarget, viewport)
  }
}

const drawHostileEstimateOverlay = (
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  screenX: number,
  screenY: number,
  highlighted: boolean,
): void => {
  drawTileBackground({
    context,
    x: screenX,
    y: screenY,
    tileSize,
    color: COLORS.enemySonar,
    alpha: highlighted ? 0.5 : 0.24,
  })
  drawGlyph({
    context,
    x: screenX,
    y: screenY,
    tileSize,
    glyph: playerGlyphForFacing(game.facing),
    color: COLORS.player,
    alpha: highlighted ? 1 : 0.62,
  })

  if (!highlighted) {
    return
  }

  const inset = Math.max(1, tileSize * 0.08)
  const lineWidth = Math.max(1, tileSize * 0.1)

  context.save()
  context.strokeStyle = COLORS.fish
  context.lineWidth = lineWidth
  context.strokeRect(
    screenX + inset,
    screenY + inset,
    Math.max(1, tileSize - inset * 2),
    Math.max(1, tileSize - inset * 2),
  )
  context.restore()
}

const drawHostileEstimateOverlays = (
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  viewport: ViewportMetrics,
  estimatedPositions: readonly Point[],
  highlightedEstimatedPosition: Point | null,
): void => {
  for (const point of estimatedPositions) {
    if (
      point.x < viewport.left ||
      point.x >= viewport.left + viewport.width ||
      point.y < viewport.top ||
      point.y >= viewport.top + viewport.height
    ) {
      continue
    }

    const viewportPoint = pointToViewport(point, viewport)
    drawHostileEstimateOverlay(
      context,
      game,
      tileSize,
      viewportPoint.x * tileSize,
      viewportPoint.y * tileSize,
      highlightedEstimatedPosition !== null &&
        highlightedEstimatedPosition.x === point.x &&
        highlightedEstimatedPosition.y === point.y,
    )
  }
}

const resolveEffectMaps = (game: GameState): EffectMaps => {
  const cachedMaps = effectMapsCache.get(game)

  if (cachedMaps) {
    return cachedMaps
  }

  const nextMaps = {
    shockwaveFront: indexFadeMap(game.shockwaveFront),
    trails: indexFadeMap(game.trails),
    dust: indexAlphaMap(game.dust),
    cracks: indexCrackMap(game.cracks),
    ventLight: buildVentLightMap(game),
  }

  effectMapsCache.set(game, nextMaps)

  return nextMaps
}

const resolveEntityMaps = (game: GameState): EntityMaps => {
  const cachedMaps = entityMapsCache.get(game)

  if (cachedMaps) {
    return cachedMaps
  }

  const nextMaps = buildEntityMaps(game)
  entityMapsCache.set(game, nextMaps)

  return nextMaps
}

const resolveTileMemoryCanvas = (
  game: GameState,
  viewport: ViewportMetrics,
): HTMLCanvasElement => {
  const cacheKey = [
    viewport.left,
    viewport.top,
    viewport.width,
    viewport.height,
    viewport.tileSize,
  ].join(":")
  const canvasesByViewport = tileMemoryCanvasCache.get(game)
  const cachedCanvas = canvasesByViewport?.get(cacheKey)

  if (cachedCanvas) {
    return cachedCanvas
  }

  const canvas = document.createElement("canvas")
  canvas.width = viewport.cssWidth
  canvas.height = viewport.cssHeight
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("2D canvas not supported")
  }

  context.font = `${
    Math.max(8, viewport.tileSize - 2)
  }px ${TERMINAL_FONT_STACK}`
  context.textAlign = "center"
  context.textBaseline = "middle"

  for (let y = viewport.top; y < viewport.top + viewport.height; y += 1) {
    for (let x = viewport.left; x < viewport.left + viewport.width; x += 1) {
      const index = y * game.map.width + x
      const screenX = (x - viewport.left) * viewport.tileSize
      const screenY = (y - viewport.top) * viewport.tileSize

      drawTileMemoryLayer({
        context,
        game,
        index,
        screenX,
        screenY,
        x,
        y,
        tileSize: viewport.tileSize,
      })
    }
  }

  const nextCanvasesByViewport = canvasesByViewport ??
    new Map<string, HTMLCanvasElement>()
  nextCanvasesByViewport.set(cacheKey, canvas)
  tileMemoryCanvasCache.set(game, nextCanvasesByViewport)

  return canvas
}

const drawPathPreview = (
  context: CanvasRenderingContext2D,
  previewPath: Point[],
  viewport: {
    left: number
    top: number
    tileSize: number
  },
): void => {
  context.save()
  context.strokeStyle = COLORS.sonar
  context.globalAlpha = 0.75
  context.lineWidth = Math.max(1, viewport.tileSize * 0.16)
  context.beginPath()

  for (let index = 0; index < previewPath.length; index += 1) {
    const point = pointToViewport(previewPath[index], viewport)
    const centerX = point.x * viewport.tileSize + viewport.tileSize / 2
    const centerY = point.y * viewport.tileSize + viewport.tileSize / 2

    if (index === 0) {
      context.moveTo(centerX, centerY)
    } else {
      context.lineTo(centerX, centerY)
    }
  }

  context.stroke()

  context.restore()
}

const drawTargetHighlight = (
  context: CanvasRenderingContext2D,
  target: Point,
  viewport: {
    left: number
    top: number
    tileSize: number
  },
): void => {
  const point = pointToViewport(target, viewport)
  const inset = Math.max(1, viewport.tileSize * 0.12)
  const lineWidth = Math.max(1, viewport.tileSize * 0.08)
  const x = point.x * viewport.tileSize + inset
  const y = point.y * viewport.tileSize + inset
  const size = Math.max(1, viewport.tileSize - inset * 2)

  context.save()
  context.strokeStyle = COLORS.player
  context.lineWidth = lineWidth
  context.shadowColor = COLORS.sonarGlow
  context.shadowBlur = viewport.tileSize * 0.4
  context.strokeRect(x, y, size, size)
  context.beginPath()
  context.moveTo(x + size / 2, y + lineWidth)
  context.lineTo(x + size / 2, y + size - lineWidth)
  context.moveTo(x + lineWidth, y + size / 2)
  context.lineTo(x + size - lineWidth, y + size / 2)
  context.stroke()
  context.restore()
}

const drawHostilePlannedPaths = (
  context: CanvasRenderingContext2D,
  game: GameState,
  viewport: {
    left: number
    top: number
    tileSize: number
  },
): void => {
  context.save()
  context.globalAlpha = 0.35
  context.lineWidth = Math.max(1, viewport.tileSize * 0.12)

  for (const hostileSubmarine of game.hostileSubmarines) {
    const path = hostileSubmarine.plannedPath ?? []

    if (path.length < 2) {
      continue
    }

    context.strokeStyle = colorForHostileSubmarine(hostileSubmarine)
    context.beginPath()

    for (let index = 0; index < path.length; index += 1) {
      const point = pointToViewport(path[index], viewport)
      const centerX = point.x * viewport.tileSize + viewport.tileSize / 2
      const centerY = point.y * viewport.tileSize + viewport.tileSize / 2

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
