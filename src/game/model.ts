import type { GeneratedMap, Point, TileKind } from "./mapgen.ts"

export type Direction = "up" | "down" | "left" | "right"
export type HorizontalDirection = "left" | "right"
export type VisibilityLevel = 0 | 1 | 2 | 3
export type GameStatus = "playing" | "won" | "lost"
export type FishMode = "idle" | "wander" | "travel"
export type HostileSubmarineMode =
  | "patrol"
  | "investigate"
  | "attack"
  | "retreat"
export type HostileSubmarineArchetype = "scout" | "hunter" | "turtle"
export type EntityMemoryKind = "item" | "enemy" | "non-hostile"

export type RevealableEntityKind =
  | "player"
  | "capsule"
  | "torpedo"
  | "depth-charge"
  | "boulder"
  | "item"
  | "hostile-submarine"
  | "fish"

export type EntityRevealKind = "player" | "capsule" | "enemy" | "item"
export type SonarMessage = { kind: "player-location"; position: Point }

export type PickupKind = "torpedo-cache" | "depth-charge-cache" | "map"

export interface Shockwave {
  origin: Point
  radius: number
  senderId: string
  damaging: boolean
  revealTerrain: boolean
  revealEntities: boolean
  message?: SonarMessage
  visibleToPlayer?: boolean
}

export interface TileReveal {
  index: number
  tile: TileKind
}

export interface EntityReveal {
  index: number
  kind: EntityRevealKind
  sourceSenderId?: string
}

export interface RevealableEntity {
  position: Point
  kind: RevealableEntityKind
}

export interface FadeCell {
  index: number
  alpha: number
  drift?: "up"
  requiresVisibility?: boolean
}

export interface CrackCell {
  index: number
  alpha: number
  glyph: string
}

export interface Torpedo {
  position: Point
  senderId: string
  direction: Direction
  speed: number
  rangeRemaining: number
  avoidFriendlyFire?: boolean
}

export interface DepthCharge {
  position: Point
  senderId: string
  speed: number
  rangeRemaining: number
  avoidFriendlyFire?: boolean
}

export interface FallingBoulder {
  position: Point
  speed: number
}

export interface PickupItem {
  position: Point
  kind: PickupKind
}

export interface Fish {
  id: string
  position: Point
  facing: HorizontalDirection
  mode: FishMode
  target?: Point | null
  idleTurnsRemaining?: number
  travelTurnsRemaining?: number
}

export interface HostileSubmarine {
  id: string
  position: Point
  facing: HorizontalDirection
  mode: HostileSubmarineMode
  target: Point | null
  reload: number
  archetype?: HostileSubmarineArchetype
  initialPosition?: Point
  torpedoAmmo?: number
  vlsAmmo?: number
  depthChargeAmmo?: number
  lastSonarTurn?: number
  lastKnownPlayerPosition?: Point | null
  lastKnownPlayerVector?: Point | null
  lastKnownPlayerTurn?: number | null
  plannedPath?: Point[]
  salvoShotsRemaining?: number
  salvoStepDirection?: "up" | "down" | null
  salvoMoveTarget?: Point | null
}

export interface GameState {
  map: GeneratedMap
  player: Point
  seed: string
  turn: number
  status: GameStatus
  playerSonarEnabled?: boolean
  capsuleKnown: boolean
  memory: Array<TileKind | null>
  entityMemory?: Array<EntityMemoryKind | null>
  visibility: VisibilityLevel[]
  lastSonarTurn: number
  playerSonarContactCueCount?: number
  shockwaves: Shockwave[]
  shockwaveFront: FadeCell[]
  torpedoes: Torpedo[]
  depthCharges: DepthCharge[]
  pickups: PickupItem[]
  fish?: Fish[]
  hostileSubmarines: HostileSubmarine[]
  trails: FadeCell[]
  dust: FadeCell[]
  cracks: CrackCell[]
  fallingBoulders: FallingBoulder[]
  facing: HorizontalDirection
  torpedoAmmo: number
  depthChargeAmmo: number
  screenShake: number
  message: string
  logs: string[]
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
