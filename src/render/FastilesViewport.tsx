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
  crtEnabled: boolean
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
  canvasContext: CanvasRenderingContext2D | null
  sourceCanvas: HTMLCanvasElement | null
  crtRenderer: ReturnType<typeof createCrtRenderer> | null
  hoveredTileKey: string | null
  props: FastilesViewportProps | null
  animationFrame: number | null
  lastFrameTime: number | null
  passiveFrameInterval: number
  effectActiveUntil: number
  crtEventIntensity: number
  crtEventLineY: number
  resizeObserver: ResizeObserver | null
  sourceDirty: boolean
}

const fastilesViewportRuntime: FastilesViewportRuntime = {
  container: null,
  canvas: null,
  canvasContext: null,
  sourceCanvas: null,
  crtRenderer: null,
  hoveredTileKey: null,
  props: null,
  animationFrame: null,
  lastFrameTime: null,
  passiveFrameInterval: 1000 / 15,
  effectActiveUntil: 0,
  crtEventIntensity: 0,
  crtEventLineY: 0.5,
  resizeObserver: null,
  sourceDirty: false,
}

const syncDisplayCanvas = () => {
  const { canvas, sourceCanvas } = fastilesViewportRuntime

  if (!canvas || !sourceCanvas || canvas === sourceCanvas) {
    return
  }

  if (canvas.width !== sourceCanvas.width) {
    canvas.width = sourceCanvas.width
  }

  if (canvas.height !== sourceCanvas.height) {
    canvas.height = sourceCanvas.height
  }

  canvas.style.width = sourceCanvas.style.width
  canvas.style.height = sourceCanvas.style.height
}

const resolveCrtEventState = (
  game: GameState,
  viewport: ReturnType<typeof resolveViewportMetrics>,
) => {
  let strongestContribution = 0
  let strongestLineY = 0.5
  let accumulatedContribution = 0

  for (const cell of game.shockwaveFront) {
    const x = cell.index % game.map.width
    const y = Math.floor(cell.index / game.map.width)
    const distance = Math.hypot(x - game.player.x, y - game.player.y)
    const inverseDistance = 1 / (1 + distance)
    const contribution = (cell.alpha * cell.alpha) * inverseDistance

    accumulatedContribution += contribution

    if (contribution <= strongestContribution) {
      continue
    }

    strongestContribution = contribution
    strongestLineY = (y - viewport.top + 0.5) / viewport.height
  }

  const shakeContribution = Math.pow(Math.max(game.screenShake, 0), 2) * 0.12
  const eventIntensity = Math.min(
    1,
    shakeContribution + accumulatedContribution * 2.8,
  )

  return {
    eventIntensity,
    lineY: Math.min(0.95, Math.max(0.05, strongestLineY)),
  }
}

const drawCrtViewport = (deltaTime: number) => {
  const {
    canvas,
    canvasContext,
    crtRenderer,
    sourceCanvas,
    sourceDirty,
    crtEventIntensity,
    crtEventLineY,
  } = fastilesViewportRuntime

  if (!canvas || !canvasContext || !sourceCanvas || canvas === sourceCanvas) {
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
  fastilesViewportRuntime.crtEventIntensity = Math.max(
    0,
    crtEventIntensity * Math.exp(-deltaTime * 5.5),
  )
  renderCrtFrame(fastilesViewportRuntime.crtRenderer!, sourceCanvas, {
    deltaTime,
    time: globalThis.performance.now() * 0.001,
    eventIntensity: fastilesViewportRuntime.crtEventIntensity,
    eventLineY: crtEventLineY,
    uploadSource: sourceDirty,
  })
  canvasContext.drawImage(fastilesViewportRuntime.crtRenderer!.canvas, 0, 0)
  fastilesViewportRuntime.sourceDirty = false
}

const runCrtAnimation = (timestamp: number) => {
  const { lastFrameTime } = fastilesViewportRuntime
  const elapsedTime = lastFrameTime === null
    ? 1000 / 60
    : timestamp - lastFrameTime

  const targetInterval = fastilesViewportRuntime.sourceDirty ||
      timestamp < fastilesViewportRuntime.effectActiveUntil ||
      fastilesViewportRuntime.crtEventIntensity > 0.001
    ? 1000 / 60
    : fastilesViewportRuntime.passiveFrameInterval

  if (elapsedTime < targetInterval) {
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
  const { canvas, canvasContext, container, sourceCanvas, props } =
    fastilesViewportRuntime

  if (!canvas || !canvasContext || !sourceCanvas || !container || !props) {
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

  const viewport = resolveViewportMetrics({
    game: props.game,
    viewportSize: {
      width: container.clientWidth || globalThis.innerWidth,
      height: container.clientHeight || globalThis.innerHeight,
    },
    renderOptions: props.renderOptions,
  })
  const eventState = resolveCrtEventState(props.game, viewport)

  syncDisplayCanvas()

  if (!props.crtEnabled) {
    stopCrtAnimation()
    destroyCrtRenderer(fastilesViewportRuntime.crtRenderer)
    fastilesViewportRuntime.crtRenderer = null
    fastilesViewportRuntime.sourceDirty = false
    fastilesViewportRuntime.crtEventIntensity = 0
    fastilesViewportRuntime.crtEventLineY = 0.5
    fastilesViewportRuntime.effectActiveUntil = 0
    canvasContext.clearRect(0, 0, canvas.width, canvas.height)
    canvasContext.drawImage(sourceCanvas, 0, 0)
    return
  }

  fastilesViewportRuntime.sourceDirty = true

  if (eventState.eventIntensity > 0.001) {
    fastilesViewportRuntime.crtEventIntensity = Math.max(
      fastilesViewportRuntime.crtEventIntensity,
      eventState.eventIntensity,
    )
    fastilesViewportRuntime.crtEventLineY = eventState.lineY
    fastilesViewportRuntime.effectActiveUntil = globalThis.performance.now() +
      Math.max(220, 1200 + eventState.eventIntensity * 900)
  }

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
  fastilesViewportRuntime.canvasContext = null
  fastilesViewportRuntime.sourceCanvas = null
  fastilesViewportRuntime.crtRenderer = null
  fastilesViewportRuntime.container = null
  fastilesViewportRuntime.resizeObserver = null
  fastilesViewportRuntime.effectActiveUntil = 0
  fastilesViewportRuntime.crtEventIntensity = 0
  fastilesViewportRuntime.crtEventLineY = 0.5
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
  const canvasContext = displayCanvas.getContext("2d")

  if (!canvasContext) {
    throw new Error("2D canvas not supported")
  }

  const sourceCanvas = document.createElement("canvas")
  sourceCanvas.className = "game-canvas game-canvas-source"
  const crtRenderer: ReturnType<typeof createCrtRenderer> | null = null

  container.appendChild(displayCanvas)

  fastilesViewportRuntime.container = container
  fastilesViewportRuntime.canvas = displayCanvas
  fastilesViewportRuntime.canvasContext = canvasContext
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

const pointsEqualOrNull = (left: Point | null, right: Point | null) => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.x === right.x && left.y === right.y
}

const pathsEqual = (left: Point[], right: Point[]) => {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  return left.every((point, index) => {
    const other = right[index]
    return point.x === other.x && point.y === other.y
  })
}

const renderOptionsEqual = (
  left: RenderOptions | undefined,
  right: RenderOptions | undefined,
) => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.debugEntityOverlay === right.debugEntityOverlay &&
    left.debugPlannedPaths === right.debugPlannedPaths &&
    left.viewportMode === right.viewportMode &&
    left.cameraTileWidth === right.cameraTileWidth &&
    left.cameraTileHeight === right.cameraTileHeight
}

const viewportInputsEqual = (
  left: FastilesViewportProps,
  right: FastilesViewportProps,
) => {
  return left.crtEnabled === right.crtEnabled &&
    left.game === right.game &&
    pointsEqualOrNull(left.selectedTarget, right.selectedTarget) &&
    pathsEqual(left.previewPath, right.previewPath) &&
    renderOptionsEqual(left.renderOptions, right.renderOptions)
}

export const FastilesViewport = (props: FastilesViewportProps) => {
  const previousProps = fastilesViewportRuntime.props
  fastilesViewportRuntime.props = props

  if (!previousProps || !viewportInputsEqual(previousProps, props)) {
    drawFastilesViewport()
  }

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
