import { useEffect, useRef } from "preact/hooks"

import type { GameState } from "../game/game.ts"
import type { Point } from "../game/mapgen.ts"
import { TERMINAL_FONT_LOAD } from "./fontFamily.ts"
import { screenShakeOffset } from "./helpers/draw.ts"
import { drawGame } from "./renderer.ts"

export function FastilesViewport(
  props: {
    game: GameState
    selectedTarget: Point | null
    previewPath: Point[]
    onTileClick: (point: Point) => void
  },
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef(props.game)
  const selectedTargetRef = useRef<Point | null>(props.selectedTarget)
  const previewPathRef = useRef<Point[]>(props.previewPath)
  const onTileClickRef = useRef(props.onTileClick)

  useEffect(() => {
    gameRef.current = props.game
  }, [props.game])

  useEffect(() => {
    selectedTargetRef.current = props.selectedTarget
  }, [props.selectedTarget])

  useEffect(() => {
    previewPathRef.current = props.previewPath
  }, [props.previewPath])

  useEffect(() => {
    onTileClickRef.current = props.onTileClick
  }, [props.onTileClick])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const canvas = document.createElement("canvas")
    canvas.className = "game-canvas"
    container.appendChild(canvas)
    canvasRef.current = canvas

    const resize = () => {
      drawGame(
        canvas,
        container,
        gameRef.current,
        selectedTargetRef.current,
        previewPathRef.current,
      )
    }

    const onCanvasClick = (event: MouseEvent) => {
      const point = pointFromMouseEvent(canvas, gameRef.current, event)

      if (point) {
        onTileClickRef.current(point)
      }
    }

    resize()
    if ("fonts" in document) {
      void document.fonts.load(TERMINAL_FONT_LOAD)
        .then(() => {
          if (
            canvasRef.current === canvas && containerRef.current === container
          ) {
            resize()
          }
        })
        .catch((error: unknown) => {
          console.warn("Failed to load IBM3270 font", error)
        })
    }
    window.addEventListener("resize", resize)
    canvas.addEventListener("click", onCanvasClick)

    return () => {
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("click", onCanvasClick)
      canvas.remove()
      canvasRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!canvas || !container) {
      return
    }

    drawGame(
      canvas,
      container,
      props.game,
      props.selectedTarget,
      props.previewPath,
    )
  }, [props.game, props.selectedTarget, props.previewPath])

  return <div class="viewport" ref={containerRef} />
}

function pointFromMouseEvent(
  canvas: HTMLCanvasElement,
  game: GameState,
  event: MouseEvent,
): Point | null {
  const rect = canvas.getBoundingClientRect()
  const shake = screenShakeOffset(game)

  if (
    event.clientX < rect.left ||
    event.clientX >= rect.right ||
    event.clientY < rect.top ||
    event.clientY >= rect.bottom
  ) {
    return null
  }

  const tileWidth = rect.width / game.map.width
  const tileHeight = rect.height / game.map.height
  const x = Math.floor((event.clientX - rect.left - shake.x) / tileWidth)
  const y = Math.floor((event.clientY - rect.top - shake.y) / tileHeight)

  if (x < 0 || x >= game.map.width || y < 0 || y >= game.map.height) {
    return null
  }

  return { x, y }
}
