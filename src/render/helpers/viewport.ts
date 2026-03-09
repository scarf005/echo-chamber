import type { GameState } from "../../game/game.ts"
import type { Point } from "../../game/mapgen.ts"
import type { RenderOptions, ViewportMode } from "../options.ts"

export const DEFAULT_CAMERA_TILE_WIDTH = 30
export const DEFAULT_CAMERA_TILE_HEIGHT = 20

export type ViewportMetrics = {
  mode: ViewportMode
  left: number
  top: number
  width: number
  height: number
  tileSize: number
  cssWidth: number
  cssHeight: number
}

export type ResolveViewportMetricsOptions = {
  game: Pick<GameState, "map" | "player">
  viewportSize: { width: number; height: number }
  renderOptions?: RenderOptions
}

export const resolveViewportMetrics = ({ game, viewportSize, renderOptions = {} }: ResolveViewportMetricsOptions): ViewportMetrics => {
  const mode = renderOptions.viewportMode ?? "camera"
  const width = mode === "full" ? game.map.width : Math.min(
    game.map.width,
    Math.max(1, renderOptions.cameraTileWidth ?? DEFAULT_CAMERA_TILE_WIDTH),
  )
  const height = mode === "full" ? game.map.height : Math.min(
    game.map.height,
    Math.max(1, renderOptions.cameraTileHeight ?? DEFAULT_CAMERA_TILE_HEIGHT),
  )
  const left = mode === "full"
    ? 0
    : clamp(game.player.x - Math.floor(width / 2), 0, game.map.width - width)
  const top = mode === "full"
    ? 0
    : clamp(game.player.y - Math.floor(height / 2), 0, game.map.height - height)
  const tileSize = calculateViewportTileSize(viewportSize, width, height)

  return {
    mode,
    left,
    top,
    width,
    height,
    tileSize,
    cssWidth: tileSize * width,
    cssHeight: tileSize * height,
  }
}

export const pointToViewport = (point: Point, viewport: Pick<ViewportMetrics, "left" | "top">): Point => {
  return {
    x: point.x - viewport.left,
    y: point.y - viewport.top,
  }
}

const calculateViewportTileSize = (viewportSize: { width: number; height: number }, viewportWidth: number, viewportHeight: number): number => {
  return Math.max(
    1,
    Math.floor(
      Math.min(
        viewportSize.width / viewportWidth,
        viewportSize.height / viewportHeight,
      ),
    ),
  )
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}
