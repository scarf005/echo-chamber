import { TERMINAL_FONT_STACK } from "./fontFamily.ts"

const GLYPHS = [
  " ",
  ".",
  "·",
  "S",
  "C",
  "■",
  "│",
  "─",
  "└",
  "┌",
  "┐",
  "┘",
  "├",
  "┤",
  "┬",
  "┴",
  "┼",
  "░",
]

export const Glyph = {
  blank: 0,
  water: 1,
  memoryWater: 2,
  player: 3,
  capsule: 4,
  wallSolo: 5,
  wallVertical: 6,
  wallHorizontal: 7,
  wallNorthEast: 8,
  wallEastSouth: 9,
  wallSouthWest: 10,
  wallWestNorth: 11,
  wallNorthEastSouth: 12,
  wallNorthSouthWest: 13,
  wallEastSouthWest: 14,
  wallNorthEastWest: 15,
  wallCross: 16,
  sonar: 17,
} as const

export function createFontAtlas(tileSize: number): HTMLCanvasElement {
  const columns = 6
  const rows = Math.ceil(GLYPHS.length / columns)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("2D canvas not supported")
  }

  canvas.width = columns * tileSize
  canvas.height = rows * tileSize
  context.fillStyle = "black"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "white"
  context.font = `${tileSize - 2}px ${TERMINAL_FONT_STACK}`
  context.textAlign = "center"
  context.textBaseline = "middle"

  GLYPHS.forEach((glyph, index) => {
    const x = (index % columns) * tileSize + tileSize / 2
    const y = Math.floor(index / columns) * tileSize + tileSize / 2 + 1
    context.fillText(glyph, x, y)
  })

  return canvas
}

export function wallGlyphForMask(mask: number): number {
  switch (mask) {
    case 0:
      return Glyph.wallSolo
    case 1:
    case 4:
    case 5:
      return Glyph.wallVertical
    case 2:
    case 8:
    case 10:
      return Glyph.wallHorizontal
    case 3:
      return Glyph.wallNorthEast
    case 6:
      return Glyph.wallEastSouth
    case 12:
      return Glyph.wallSouthWest
    case 9:
      return Glyph.wallWestNorth
    case 7:
      return Glyph.wallNorthEastSouth
    case 13:
      return Glyph.wallNorthSouthWest
    case 14:
      return Glyph.wallEastSouthWest
    case 11:
      return Glyph.wallNorthEastWest
    default:
      return Glyph.wallCross
  }
}
