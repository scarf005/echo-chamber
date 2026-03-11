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
export type HostileSubmarineArchetype = "scout" | "hunter" | "turtle" | "guard"
export type HostileWeaponKind = "torpedo" | "vls" | "depth-charge"
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

export type EntityRevealKind =
  | "player"
  | "capsule"
  | "enemy"
  | "item"
  | "non-hostile"
export type SonarContactAudioVariant = "digital" | "kizilsungur"
export type SonarMessage = { kind: "player-location"; position: Point }
export type LogMessageTone =
  | "positive"
  | "negative"
  | "warning"
  | "neutral"
  | "ai"

export interface LogMessage {
  message: string
  type: LogMessageTone
}

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
  senderId?: string
}

export interface FadeCell {
  index: number
  alpha: number
  drift?: "up"
  source?: "vent" | "player-projectile" | "enemy-projectile"
  requiresVisibility?: boolean
  visibleToPlayer?: boolean
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

export interface HostileAttackDebugState {
  attackTarget: Point | null
  guessedTarget: Point | null
  blockedReason: string | null
  directLane: boolean
  horizontalShotOpportunity: boolean
  verticalShotOpportunity: boolean
  ceilingTrapDirection: Direction | null
  turnAge: number | null
  maxEvidenceAge: number | null
  confidence: number | null
  avoidFriendlyFire: boolean
  firedWeapon: HostileWeaponKind | null
  firedDirection: Direction | null
  salvoShotsRemaining: number
  salvoStepDirection: Direction | null
  salvoMoveTarget: Point | null
}

export interface HostileAiDebugState {
  confirmedPlayerPosition: Point | null
  cluePosition: Point | null
  playerVector: Point | null
  directDetection: boolean
  detectedByPlayerSonar: boolean
  receivedImmediateRelay: boolean
  alertedByCapsuleRecovery: boolean
  retainedPlannedPath: boolean
  repositioningForSalvo: boolean
  movementTarget: Point | null
  sonarInterval: number | null
  emittedSonar: boolean
  broadcastPlayerFix: boolean
  attack: HostileAttackDebugState
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
  lastKnownPlayerFromDirectDetection?: boolean
  directDetectionActive?: boolean
  engagementGraceUntilTurn?: number | null
  previousPosition?: Point | null
  recentPositions?: Point[]
  plannedPath?: Point[]
  lastAiLog?: string | null
  salvoShotsRemaining?: number
  salvoStepDirection?: Direction | null
  salvoMoveTarget?: Point | null
  debugState?: HostileAiDebugState
}

export interface GameState {
  map: GeneratedMap
  player: Point
  seed: string
  turn: number
  status: GameStatus
  playerSonarEnabled?: boolean
  hostileEngagementGraceTurns?: number
  hostileContactActive?: boolean
  hostileContactGraceUntilTurn?: number | null
  capsuleKnown: boolean
  capsuleCollected?: boolean
  memory: Array<TileKind | null>
  entityMemory?: Array<EntityMemoryKind | null>
  visibility: VisibilityLevel[]
  lastSonarTurn: number
  playerSonarContactCueCount?: number
  playerSonarContactAudioVariant?: SonarContactAudioVariant | null
  hostileSonarContactCueCount?: number
  playerEntityHitCueCount?: number
  playerDeathCueCount?: number
  playerPickupCueCount?: number
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
  structuralDamage?: number[]
  fallingBoulders: FallingBoulder[]
  facing: HorizontalDirection
  torpedoAmmo: number
  depthChargeAmmo: number
  screenShake: number
  message: string
  logs: LogMessage[]
}

export interface GameOptions {
  seed?: string
  width?: number
  height?: number
  hostileEngagementGraceTurns?: number
  hostileSubmarineCount?: number
}

export type TurnAction =
  | { kind: "torpedo"; direction: Direction }
  | { kind: "depth-charge" }
