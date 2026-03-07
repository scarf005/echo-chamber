import type { GeneratedMap, Point, TileKind } from "./mapgen.ts"

export type Direction = "up" | "down" | "left" | "right"
export type HorizontalDirection = "left" | "right"
export type VisibilityLevel = 0 | 1 | 2 | 3
export type GameStatus = "playing" | "won"

export interface SonarWave {
  origin: Point
  radius: number
}

export interface FadeCell {
  index: number
  alpha: number
}

export interface CrackCell {
  index: number
  alpha: number
  glyph: string
}

export interface Torpedo {
  position: Point
  direction: HorizontalDirection
  speed: number
  rangeRemaining: number
}

export interface DepthCharge {
  position: Point
  speed: number
  rangeRemaining: number
}

export interface FallingBoulder {
  position: Point
  speed: number
}

export interface GameState {
  map: GeneratedMap
  player: Point
  seed: string
  turn: number
  status: GameStatus
  capsuleKnown: boolean
  memory: Array<TileKind | null>
  visibility: VisibilityLevel[]
  lastSonarTurn: number
  sonarWaves: SonarWave[]
  sonarFront: FadeCell[]
  torpedoes: Torpedo[]
  depthCharges: DepthCharge[]
  trails: FadeCell[]
  dust: FadeCell[]
  cracks: CrackCell[]
  fallingBoulders: FallingBoulder[]
  facing: HorizontalDirection
  torpedoesRemaining: number
  screenShake: number
  message: string
}

export interface GameOptions {
  seed?: string
  width?: number
  height?: number
}

export type TurnAction =
  | { kind: "torpedo"; direction: HorizontalDirection }
  | { kind: "depth-charge" }
