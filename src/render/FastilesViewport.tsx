import { useEffect, useRef } from "preact/hooks"

import type { GameState } from "../game/game.ts"
import { createFontAtlas, Glyph, wallGlyphForMask } from "./fontAtlas.ts"
import { Palette, Scene } from "../vendor/fastiles/fastiles.js"

const COLORS = [
  "#03070c",
  "#3a6f7b",
  "#8af4ff",
  "#284248",
  "#d7fff8",
  "#ffc857",
  "#ff6b6b",
  "#123348",
]

const PALETTE = {
  background: 0,
  memoryWater: 1,
  visibleWater: 2,
  memoryWall: 3,
  visibleWall: 4,
  player: 5,
  capsule: 6,
  sonarBackground: 7,
} as const

export function FastilesViewport(props: { game: GameState }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<InstanceType<typeof Scene> | null>(null)
  const gameRef = useRef(props.game)

  useEffect(() => {
    gameRef.current = props.game
  }, [props.game])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const palette = Palette.fromArray(COLORS)
    const tileSize = calculateTileSize(container, gameRef.current)
    const scene = new Scene({
      tileCount: [gameRef.current.map.width, gameRef.current.map.height],
      tileSize: [tileSize, tileSize],
      font: createFontAtlas(tileSize),
    }, palette)
    const node = scene.node

    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("fastiles scene did not return a canvas")
    }

    node.className = "game-canvas"
    container.appendChild(node)
    sceneRef.current = scene

    const resize = () => {
      const currentGame = gameRef.current
      const nextTileSize = calculateTileSize(container, currentGame)
      scene.configure({
        tileCount: [currentGame.map.width, currentGame.map.height],
        tileSize: [nextTileSize, nextTileSize],
        font: createFontAtlas(nextTileSize),
      })
      drawGame(scene, currentGame)
    }

    resize()
    window.addEventListener("resize", resize)

    return () => {
      window.removeEventListener("resize", resize)
      node.remove()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current

    if (!scene) {
      return
    }

    drawGame(scene, props.game)
  }, [props.game])

  return <div class="viewport" ref={containerRef} />
}

function drawGame(scene: InstanceType<typeof Scene>, game: GameState): void {
  scene.clear(PALETTE.background)
  const sonarFront = new Set(game.sonarFront)

  for (let y = 0; y < game.map.height; y += 1) {
    for (let x = 0; x < game.map.width; x += 1) {
      const index = y * game.map.width + x
      const visibility = game.visibility[index]
      const memory = game.memory[index]
      const sonarFlash = sonarFront.has(index)
      const background = sonarFlash
        ? PALETTE.sonarBackground
        : PALETTE.background

      let glyph: number = Glyph.blank
      let foreground: number = PALETTE.memoryWater

      if (memory === "wall") {
        glyph = wallGlyphForMask(wallMask(game, x, y))
        foreground = visibility >= 2 ? PALETTE.visibleWall : PALETTE.memoryWall
      } else if (memory === "water") {
        glyph = visibility >= 2 ? Glyph.water : Glyph.memoryWater
        foreground = visibility >= 2
          ? PALETTE.visibleWater
          : PALETTE.memoryWater
      }

      if (x === game.map.capsule.x && y === game.map.capsule.y && memory) {
        glyph = Glyph.capsule
        foreground = PALETTE.capsule
      }

      if (x === game.player.x && y === game.player.y) {
        glyph = Glyph.player
        foreground = PALETTE.player
      } else if (sonarFront.has(index)) {
        glyph = Glyph.sonar
        foreground = PALETTE.visibleWater
      }

      scene.draw([x, y], glyph, foreground, background)
    }
  }
}

function wallMask(game: GameState, x: number, y: number): number {
  return Number(isKnownWall(game, x, y - 1)) |
    (Number(isKnownWall(game, x + 1, y)) << 1) |
    (Number(isKnownWall(game, x, y + 1)) << 2) |
    (Number(isKnownWall(game, x - 1, y)) << 3)
}

function isKnownWall(game: GameState, x: number, y: number): boolean {
  if (x < 0 || x >= game.map.width || y < 0 || y >= game.map.height) {
    return false
  }

  return game.memory[y * game.map.width + x] === "wall"
}

function calculateTileSize(container: HTMLDivElement, game: GameState): number {
  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight
  return Math.max(
    8,
    Math.floor(Math.min(width / game.map.width, height / game.map.height)),
  )
}
