import type { GameState } from "../game/game.ts"
import type { Point } from "../game/mapgen.ts"
import { TERMINAL_FONT_LOAD } from "./fontFamily.ts"
import { screenShakeOffset } from "./helpers/draw.ts"
import { resolveViewportMetrics } from "./helpers/viewport.ts"
import type { RenderOptions } from "./options.ts"
import { drawGame } from "./renderer.ts"

type FastilesViewportProps = {
  game: GameState
  selectedTarget: Point | null
  previewPath: Point[]
  onTileClick: (point: Point) => void
  onTileHover: (point: Point | null) => void
  renderOptions?: RenderOptions
}

type FastilesViewportRuntime = {
  container: HTMLDivElement | null
  canvas: HTMLCanvasElement | null
  hoveredTileKey: string | null
  props: FastilesViewportProps | null
}

const fastilesViewportRuntime: FastilesViewportRuntime = {
  container: null,
  canvas: null,
  hoveredTileKey: null,
  props: null,
}

const drawFastilesViewport = () => {
  const { canvas, container, props } = fastilesViewportRuntime

  if (!canvas || !container || !props) {
    return
  }

  drawGame(
    canvas,
    container,
    props.game,
    props.selectedTarget,
    props.previewPath,
    props.renderOptions,
  )
}

const handleCanvasClick = (event: MouseEvent) => {
  const { canvas, props } = fastilesViewportRuntime

  if (!canvas || !props) {
    return
  }

  const point = pointFromMouseEvent(
    canvas,
    props.game,
    props.renderOptions,
    event,
  )

  if (point) {
    props.onTileClick(point)
  }
}

const handleCanvasPointerMove = (event: PointerEvent) => {
  const { canvas, props } = fastilesViewportRuntime

  if (!canvas || !props) {
    return
  }

  const point = pointFromMouseEvent(
    canvas,
    props.game,
    props.renderOptions,
    event,
  )
  const nextHoveredTileKey = point ? `${point.x}:${point.y}` : null

  if (nextHoveredTileKey === fastilesViewportRuntime.hoveredTileKey) {
    return
  }

  fastilesViewportRuntime.hoveredTileKey = nextHoveredTileKey
  props.onTileHover(point)
}

const handleCanvasPointerLeave = () => {
  const { props } = fastilesViewportRuntime

  if (!props) {
    return
  }

  fastilesViewportRuntime.hoveredTileKey = null
  props.onTileHover(null)
}

const detachViewport = () => {
  const { canvas, props } = fastilesViewportRuntime

  if (canvas) {
    globalThis.removeEventListener("resize", drawFastilesViewport)
    canvas.removeEventListener("click", handleCanvasClick)
    canvas.removeEventListener("pointermove", handleCanvasPointerMove)
    canvas.removeEventListener("pointerleave", handleCanvasPointerLeave)
    canvas.remove()
  }

  fastilesViewportRuntime.hoveredTileKey = null
  props?.onTileHover(null)
  fastilesViewportRuntime.canvas = null
  fastilesViewportRuntime.container = null
}

const attachViewport = (container: HTMLDivElement) => {
  if (fastilesViewportRuntime.container === container) {
    drawFastilesViewport()
    return
  }

  detachViewport()

  const canvas = document.createElement("canvas")
  canvas.className = "game-canvas"
  container.appendChild(canvas)

  fastilesViewportRuntime.container = container
  fastilesViewportRuntime.canvas = canvas
  fastilesViewportRuntime.hoveredTileKey = null

  globalThis.addEventListener("resize", drawFastilesViewport)
  canvas.addEventListener("click", handleCanvasClick)
  canvas.addEventListener("pointermove", handleCanvasPointerMove)
  canvas.addEventListener("pointerleave", handleCanvasPointerLeave)

  drawFastilesViewport()

  if ("fonts" in document) {
    void document.fonts.load(TERMINAL_FONT_LOAD)
      .then(() => {
        if (
          fastilesViewportRuntime.canvas === canvas &&
          fastilesViewportRuntime.container === container
        ) {
          drawFastilesViewport()
        }
      })
      .catch((error: unknown) => {
        console.warn("Failed to load IBM3270 font", error)
      })
  }
}

const setViewportContainer = (container: HTMLDivElement | null) => {
  if (container) {
    attachViewport(container)
    return
  }

  detachViewport()
}

export const FastilesViewport = (props: FastilesViewportProps) => {
  fastilesViewportRuntime.props = props
  drawFastilesViewport()

  return <div class="viewport" ref={setViewportContainer} />
}

const pointFromMouseEvent = (
  canvas: HTMLCanvasElement,
  game: GameState,
  renderOptions: RenderOptions | undefined,
  event: MouseEvent,
): Point | null => {
  const rect = canvas.getBoundingClientRect()
  const shake = screenShakeOffset(game)
  const viewport = resolveViewportMetrics({
    game,
    viewportSize: {
      width: rect.width,
      height: rect.height,
    },
    renderOptions,
  })

  if (
    event.clientX < rect.left ||
    event.clientX >= rect.right ||
    event.clientY < rect.top ||
    event.clientY >= rect.bottom
  ) {
    return null
  }

  const x = Math.floor(
    (event.clientX - rect.left - shake.x) / viewport.tileSize,
  ) + viewport.left
  const y = Math.floor(
    (event.clientY - rect.top - shake.y) / viewport.tileSize,
  ) + viewport.top

  if (x < 0 || x >= game.map.width || y < 0 || y >= game.map.height) {
    return null
  }

  return { x, y }
}
