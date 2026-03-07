import {
  type GeneratedMap,
  generateMap,
  isPassableTile,
  type Point,
  tileAt,
  type TileKind,
} from "./mapgen.ts"

export type Direction = "up" | "down" | "left" | "right"
export type VisibilityLevel = 0 | 1 | 2 | 3
export type GameStatus = "playing" | "won"

export interface SonarWave {
  origin: Point
  radius: number
}

export interface GameState {
  map: GeneratedMap
  player: Point
  seed: string
  turn: number
  status: GameStatus
  memory: Array<TileKind | null>
  visibility: VisibilityLevel[]
  lastSonarTurn: number
  sonarWaves: SonarWave[]
  sonarFront: number[]
  message: string
}

export interface GameOptions {
  seed?: string
  width?: number
  height?: number
}

const PASSIVE_EXACT_RADIUS = 1
const PASSIVE_DETECTED_RADIUS = 2
const SONAR_INTERVAL = 3
const SONAR_SPEED = 3
const SONAR_RAY_DENSITY = 14

export function createGame(options: GameOptions = {}): GameState {
  const map = generateMap({
    width: options.width ?? 144,
    height: options.height ?? 84,
    seed: options.seed,
    smoothingIterations: 4,
    topology: 8,
    wallProbability: 0.45,
  })
  const game: GameState = {
    map,
    player: { ...map.spawn },
    seed: map.seed,
    turn: 0,
    status: "playing",
    memory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from(
      { length: map.tiles.length },
      () => 0 as VisibilityLevel,
    ),
    lastSonarTurn: 0,
    sonarWaves: [],
    sonarFront: [],
    message: "Reach the capsule. Sonar emits every 3 turns.",
  }

  return refreshPerception(game, [])
}

export function createRandomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function directionFromKey(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up"
    case "ArrowDown":
    case "s":
    case "S":
      return "down"
    case "ArrowLeft":
    case "a":
    case "A":
      return "left"
    case "ArrowRight":
    case "d":
    case "D":
      return "right"
    default:
      return null
  }
}

export function movePlayer(game: GameState, direction: Direction): GameState {
  if (game.status !== "playing") {
    return game
  }

  const delta = deltaForDirection(direction)
  const target = {
    x: game.player.x + delta.x,
    y: game.player.y + delta.y,
  }

  if (!isPassableTile(tileAt(game.map, target.x, target.y))) {
    return {
      ...game,
      message: "Hull blocked.",
    }
  }

  const nextTurn = game.turn + 1
  const shouldEmitSonar = nextTurn % SONAR_INTERVAL === 0
  const sonarStep = stepSonar(
    game.map,
    target,
    game.sonarWaves,
    shouldEmitSonar,
  )
  const won = target.x === game.map.capsule.x && target.y === game.map.capsule.y

  return refreshPerception(
    {
      ...game,
      player: target,
      turn: nextTurn,
      status: won ? "won" : "playing",
      lastSonarTurn: shouldEmitSonar ? nextTurn : game.lastSonarTurn,
      sonarWaves: sonarStep.waves,
      sonarFront: sonarStep.front,
      message: won
        ? "Capsule secured. Press R for a new run."
        : shouldEmitSonar
        ? "Sonar wave emitted."
        : sonarStep.front.length > 0
        ? "Sonar wave propagates."
        : "Advance.",
    },
    sonarStep.revealed,
  )
}

function refreshPerception(
  game: GameState,
  sonarReveals: Array<{ index: number; tile: TileKind }>,
): GameState {
  const memory = game.memory.slice()
  const visibility = Array.from(
    { length: game.map.tiles.length },
    () => 0 as VisibilityLevel,
  )

  for (let y = 0; y < game.map.height; y += 1) {
    for (let x = 0; x < game.map.width; x += 1) {
      const tile = tileAt(game.map, x, y)

      if (!tile) {
        continue
      }

      const index = y * game.map.width + x
      const distance = chebyshevDistance(game.player, { x, y })

      if (distance <= PASSIVE_EXACT_RADIUS) {
        memory[index] = tile
        setVisibility(visibility, index, 3)
        continue
      }

      if (distance <= PASSIVE_DETECTED_RADIUS) {
        memory[index] = tile
        setVisibility(visibility, index, 2)
      }
    }
  }

  for (const reveal of sonarReveals) {
    memory[reveal.index] = reveal.tile
    setVisibility(visibility, reveal.index, 1)
  }

  return {
    ...game,
    memory,
    visibility,
  }
}

function stepSonar(
  map: GeneratedMap,
  emitter: Point,
  waves: SonarWave[],
  emitNewWave: boolean,
): {
  waves: SonarWave[]
  front: number[]
  revealed: Array<{ index: number; tile: TileKind }>
} {
  const front = new Set<number>()
  const reveals = new Map<number, TileKind>()
  const nextWaves: SonarWave[] = []

  for (const wave of waves) {
    const nextRadius = wave.radius + SONAR_SPEED
    const trace = traceWaveBand(map, wave.origin, wave.radius, nextRadius)

    trace.front.forEach((index) => front.add(index))
    trace.revealed.forEach((tile, index) => reveals.set(index, tile))

    if (trace.front.size > 0) {
      nextWaves.push({ origin: wave.origin, radius: nextRadius })
    }
  }

  if (emitNewWave) {
    nextWaves.push({ origin: { ...emitter }, radius: 0 })
    front.add(indexForPoint(map.width, emitter))
  }

  return {
    waves: nextWaves,
    front: Array.from(front),
    revealed: Array.from(reveals, ([index, tile]) => ({ index, tile })),
  }
}

function traceWaveBand(
  map: GeneratedMap,
  origin: Point,
  previousRadius: number,
  nextRadius: number,
): {
  front: Set<number>
  revealed: Map<number, TileKind>
} {
  const front = new Set<number>()
  const revealed = new Map<number, TileKind>()
  const rayCount = Math.max(64, Math.ceil(nextRadius * SONAR_RAY_DENSITY))

  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index / rayCount) * Math.PI * 2
    const target = {
      x: Math.round(origin.x + Math.cos(angle) * nextRadius),
      y: Math.round(origin.y + Math.sin(angle) * nextRadius),
    }
    const line = bresenhamLine(origin, target)

    for (let lineIndex = 1; lineIndex < line.length; lineIndex += 1) {
      const point = line[lineIndex]
      const tile = tileAt(map, point.x, point.y)

      if (!tile) {
        break
      }

      const distance = euclideanDistance(origin, point)

      if (distance > nextRadius + 0.5) {
        break
      }

      const mapIndex = indexForPoint(map.width, point)

      if (tile === "wall") {
        if (distance > previousRadius) {
          revealed.set(mapIndex, tile)
          front.add(mapIndex)
        }

        break
      }

      if (distance > previousRadius) {
        revealed.set(mapIndex, tile)
        front.add(mapIndex)
      }
    }
  }

  return { front, revealed }
}

function bresenhamLine(start: Point, end: Point): Point[] {
  const points: Point[] = []
  let x0 = start.x
  let y0 = start.y
  const x1 = end.x
  const y1 = end.y
  const deltaX = Math.abs(x1 - x0)
  const stepX = x0 < x1 ? 1 : -1
  const deltaY = -Math.abs(y1 - y0)
  const stepY = y0 < y1 ? 1 : -1
  let error = deltaX + deltaY

  while (true) {
    points.push({ x: x0, y: y0 })

    if (x0 === x1 && y0 === y1) {
      return points
    }

    const doubledError = error * 2

    if (doubledError >= deltaY) {
      error += deltaY
      x0 += stepX
    }

    if (doubledError <= deltaX) {
      error += deltaX
      y0 += stepY
    }
  }
}

function setVisibility(
  visibility: VisibilityLevel[],
  index: number,
  level: VisibilityLevel,
): void {
  if (visibility[index] < level) {
    visibility[index] = level
  }
}

function indexForPoint(width: number, point: Point): number {
  return point.y * width + point.x
}

function deltaForDirection(direction: Direction): Point {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 }
    case "down":
      return { x: 0, y: 1 }
    case "left":
      return { x: -1, y: 0 }
    case "right":
      return { x: 1, y: 0 }
  }
}

function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function euclideanDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
