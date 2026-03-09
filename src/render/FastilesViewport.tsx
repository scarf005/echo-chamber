import type { GameState } from "../game/game.ts"
import type { Point } from "../game/mapgen.ts"
import {
  createCrtRenderer,
  destroyCrtRenderer,
  renderCrtFrame,
} from "./crtWebgl.ts"
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
  sourceCanvas: HTMLCanvasElement | null
  crtRenderer: ReturnType<typeof createCrtRenderer> | null
  hoveredTileKey: string | null
  props: FastilesViewportProps | null
  animationFrame: number | null
  lastFrameTime: number | null
  resizeObserver: ResizeObserver | null
  sourceDirty: boolean
}

const fastilesViewportRuntime: FastilesViewportRuntime = {
  container: null,
  canvas: null,
  sourceCanvas: null,
  crtRenderer: null,
  hoveredTileKey: null,
  props: null,
  animationFrame: null,
  lastFrameTime: null,
  resizeObserver: null,
  sourceDirty: false,
}

const syncDisplayCanvas = () => {
  const { canvas, sourceCanvas } = fastilesViewportRuntime

  if (!canvas || !sourceCanvas || canvas === sourceCanvas) {
    return
  }

  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height
  canvas.style.width = sourceCanvas.style.width
  canvas.style.height = sourceCanvas.style.height
}

const drawCrtViewport = (deltaTime: number) => {
  const { canvas, crtRenderer, sourceCanvas, sourceDirty } =
    fastilesViewportRuntime

  if (!canvas || !sourceCanvas || canvas === sourceCanvas) {
    return
  }

  if (
    !crtRenderer || crtRenderer.canvas.width !== sourceCanvas.width ||
    crtRenderer.canvas.height !== sourceCanvas.height
  ) {
    destroyCrtRenderer(crtRenderer)
    const renderCanvas = document.createElement("canvas")
    renderCanvas.width = sourceCanvas.width
    renderCanvas.height = sourceCanvas.height
    fastilesViewportRuntime.crtRenderer = createCrtRenderer(renderCanvas)
  }

  syncDisplayCanvas()
  renderCrtFrame(fastilesViewportRuntime.crtRenderer!, sourceCanvas, {
    deltaTime,
    uploadSource: sourceDirty,
  })
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("2D canvas not supported")
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(fastilesViewportRuntime.crtRenderer!.canvas, 0, 0)
  fastilesViewportRuntime.sourceDirty = false
}

const runCrtAnimation = (timestamp: number) => {
  const { lastFrameTime } = fastilesViewportRuntime
  const elapsedTime = lastFrameTime === null
    ? 1000 / 30
    : timestamp - lastFrameTime

  if (elapsedTime < 1000 / 30) {
    fastilesViewportRuntime.animationFrame = globalThis.requestAnimationFrame(
      runCrtAnimation,
    )
    return
  }

  const deltaTime = elapsedTime / 1000

  fastilesViewportRuntime.lastFrameTime = timestamp
  drawCrtViewport(deltaTime)
  fastilesViewportRuntime.animationFrame = globalThis.requestAnimationFrame(
    runCrtAnimation,
  )
}

const startCrtAnimation = () => {
  if (fastilesViewportRuntime.animationFrame !== null) {
    return
  }

  fastilesViewportRuntime.lastFrameTime = null
  fastilesViewportRuntime.animationFrame = globalThis.requestAnimationFrame(
    runCrtAnimation,
  )
}

const stopCrtAnimation = () => {
  if (fastilesViewportRuntime.animationFrame === null) {
    return
  }

  globalThis.cancelAnimationFrame(fastilesViewportRuntime.animationFrame)
  fastilesViewportRuntime.animationFrame = null
  fastilesViewportRuntime.lastFrameTime = null
}

const drawFastilesViewport = () => {
  const { container, sourceCanvas, props } = fastilesViewportRuntime

  if (!sourceCanvas || !container || !props) {
    return
  }

  drawGame(
    sourceCanvas,
    container,
    props.game,
    props.selectedTarget,
    props.previewPath,
    props.renderOptions,
  )

  fastilesViewportRuntime.sourceDirty = true
  startCrtAnimation()
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
  const { canvas, props, resizeObserver } = fastilesViewportRuntime

  stopCrtAnimation()
  resizeObserver?.disconnect()

  if (canvas) {
    globalThis.removeEventListener("resize", drawFastilesViewport)
    canvas.removeEventListener("click", handleCanvasClick)
    canvas.removeEventListener("pointermove", handleCanvasPointerMove)
    canvas.removeEventListener("pointerleave", handleCanvasPointerLeave)
    canvas.remove()
  }

  destroyCrtRenderer(fastilesViewportRuntime.crtRenderer)
  fastilesViewportRuntime.hoveredTileKey = null
  props?.onTileHover(null)
  fastilesViewportRuntime.canvas = null
  fastilesViewportRuntime.sourceCanvas = null
  fastilesViewportRuntime.crtRenderer = null
  fastilesViewportRuntime.container = null
  fastilesViewportRuntime.resizeObserver = null
  fastilesViewportRuntime.sourceDirty = false
}

const attachViewport = (container: HTMLDivElement) => {
  if (fastilesViewportRuntime.container === container) {
    drawFastilesViewport()
    return
  }

  detachViewport()

  const displayCanvas = document.createElement("canvas")
  displayCanvas.className = "game-canvas"
  const sourceCanvas = document.createElement("canvas")
  sourceCanvas.className = "game-canvas game-canvas-source"
  const crtRenderer: ReturnType<typeof createCrtRenderer> | null = null

  container.appendChild(displayCanvas)

  fastilesViewportRuntime.container = container
  fastilesViewportRuntime.canvas = displayCanvas
  fastilesViewportRuntime.sourceCanvas = sourceCanvas
  fastilesViewportRuntime.crtRenderer = crtRenderer
  fastilesViewportRuntime.hoveredTileKey = null
  fastilesViewportRuntime.sourceDirty = true

  globalThis.addEventListener("resize", drawFastilesViewport)
  displayCanvas.addEventListener("click", handleCanvasClick)
  displayCanvas.addEventListener("pointermove", handleCanvasPointerMove)
  displayCanvas.addEventListener("pointerleave", handleCanvasPointerLeave)

  if ("ResizeObserver" in globalThis) {
    const resizeObserver = new globalThis.ResizeObserver(() => {
      drawFastilesViewport()
    })
    resizeObserver.observe(container)
    fastilesViewportRuntime.resizeObserver = resizeObserver
  }

  drawFastilesViewport()

  if ("fonts" in document) {
    void document.fonts.load(TERMINAL_FONT_LOAD)
      .then(() => {
        if (
          fastilesViewportRuntime.canvas === displayCanvas &&
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
