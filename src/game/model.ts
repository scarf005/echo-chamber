import type { GeneratedMap, Point, TileKind } from "./mapgen.ts"

export type Direction = "up" | "down" | "left" | "right"
export type HorizontalDirection = "left" | "right"
export type VisibilityLevel = 0 | 1 | 2 | 3
export type GameStatus = "playing" | "won" | "lost"
export type HostileSubmarineMode = "patrol" | "investigate" | "attack"
export type EntityMemoryKind = "item" | "hostile-submarine"

export type RevealableEntityKind =
  | "capsule"
  | "torpedo"
  | "depth-charge"
  | "boulder"
  | "item"
  | "hostile-submarine"

export type PickupKind = "torpedo-cache" | "depth-charge-cache" | "map"

export interface Shockwave {
  origin: Point
  radius: number
  senderId: string
  damaging: boolean
  revealTerrain: boolean
  revealEntities: boolean
}

export interface TileReveal {
  index: number
  tile: TileKind
}

export interface EntityReveal {
  index: number
  kind: RevealableEntityKind
}

export interface RevealableEntity {
  position: Point
  kind: RevealableEntityKind
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
  senderId: string
  direction: HorizontalDirection
  speed: number
  rangeRemaining: number
}

export interface DepthCharge {
  position: Point
  senderId: string
  speed: number
  rangeRemaining: number
}

export interface FallingBoulder {
  position: Point
  speed: number
}

export interface PickupItem {
  position: Point
  kind: PickupKind
}

export interface HostileSubmarine {
  id: string
  position: Point
  facing: HorizontalDirection
  mode: HostileSubmarineMode
  target: Point | null
  reload: number
}

export interface GameState {
  map: GeneratedMap
  player: Point
  seed: string
  turn: number
  status: GameStatus
  capsuleKnown: boolean
  memory: Array<TileKind | null>
  entityMemory?: Array<EntityMemoryKind | null>
  visibility: VisibilityLevel[]
  lastSonarTurn: number
  shockwaves: Shockwave[]
  shockwaveFront: FadeCell[]
  torpedoes: Torpedo[]
  depthCharges: DepthCharge[]
  pickups: PickupItem[]
  hostileSubmarines: HostileSubmarine[]
  trails: FadeCell[]
  dust: FadeCell[]
  cracks: CrackCell[]
  fallingBoulders: FallingBoulder[]
  logs: string[]
  facing: HorizontalDirection
  torpedoAmmo: number
  depthChargeAmmo: number
  screenShake: number
  message: string
}

export interface GameOptions {
  seed?: string
  width?: number
  height?: number
  hostileSubmarineCount?: number
}

export type TurnAction =
  | { kind: "torpedo"; direction: HorizontalDirection }
  | { kind: "depth-charge" }
