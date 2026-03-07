import { useEffect, useRef } from "preact/hooks"

import type { GameState } from "../game/game.ts"
import { TERMINAL_FONT_LOAD } from "./fontFamily.ts"
import { drawGame } from "./renderer.ts"

export function FastilesViewport(props: { game: GameState }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef(props.game)

  useEffect(() => {
    gameRef.current = props.game
  }, [props.game])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const canvas = document.createElement("canvas")
    canvas.className = "game-canvas"
    container.appendChild(canvas)
    canvasRef.current = canvas

    const resize = () => drawGame(canvas, container, gameRef.current)

    resize()
    if ("fonts" in document) {
      void document.fonts.load(TERMINAL_FONT_LOAD)
        .then(() => {
          if (canvasRef.current === canvas && containerRef.current === container) {
            resize()
          }
        })
        .catch((error: unknown) => {
          console.warn("Failed to load IBM3270 font", error)
        })
    }
    window.addEventListener("resize", resize)

    return () => {
      window.removeEventListener("resize", resize)
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

    drawGame(canvas, container, props.game)
  }, [props.game])

  return <div class="viewport" ref={containerRef} />
}
