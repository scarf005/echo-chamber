import { type GeneratedMap, type Point, tileAt } from "./mapgen.ts"
import type {
  DepthCharge,
  Direction,
  FallingBoulder,
  Fish,
  HorizontalDirection,
  HostileAiDebugState,
  HostileSubmarine,
  Torpedo,
} from "./model.ts"

export const cloneMap = (map: GeneratedMap): GeneratedMap => {
  return {
    ...map,
    spawn: { ...map.spawn },
    capsule: { ...map.capsule },
    tiles: map.tiles.slice(),
    metadata: {
      ...map.metadata,
      biomes: map.metadata.biomes.slice(),
    },
  }
}

export const cloneTorpedo = (torpedo: Torpedo): Torpedo => {
  return {
    ...torpedo,
    position: { ...torpedo.position },
  }
}

export const cloneDepthCharge = (depthCharge: DepthCharge): DepthCharge => {
  return {
    ...depthCharge,
    position: { ...depthCharge.position },
  }
}

export const cloneFish = (fish: Fish): Fish => {
  return {
    ...fish,
    position: { ...fish.position },
    target: fish.target ? { ...fish.target } : null,
  }
}

export const cloneBoulder = (boulder: FallingBoulder): FallingBoulder => {
  return {
    ...boulder,
    position: { ...boulder.position },
  }
}

export const cloneHostileSubmarine = (
  hostileSubmarine: HostileSubmarine,
): HostileSubmarine => {
  return {
    ...hostileSubmarine,
    position: { ...hostileSubmarine.position },
    target: hostileSubmarine.target ? { ...hostileSubmarine.target } : null,
    previousPosition: hostileSubmarine.previousPosition
      ? { ...hostileSubmarine.previousPosition }
      : null,
    recentPositions: hostileSubmarine.recentPositions?.map((point) => ({
      ...point,
    })),
    initialPosition: hostileSubmarine.initialPosition
      ? { ...hostileSubmarine.initialPosition }
      : undefined,
    lastKnownPlayerPosition: hostileSubmarine.lastKnownPlayerPosition
      ? { ...hostileSubmarine.lastKnownPlayerPosition }
      : null,
    lastKnownPlayerVector: hostileSubmarine.lastKnownPlayerVector
      ? { ...hostileSubmarine.lastKnownPlayerVector }
      : null,
    plannedPath: hostileSubmarine.plannedPath?.map((point) => ({ ...point })),
    salvoMoveTarget: hostileSubmarine.salvoMoveTarget
      ? { ...hostileSubmarine.salvoMoveTarget }
      : null,
    debugState: hostileSubmarine.debugState
      ? cloneHostileAiDebugState(hostileSubmarine.debugState)
      : undefined,
  }
}

const cloneHostileAiDebugState = (
  debugState: HostileAiDebugState,
): HostileAiDebugState => {
  return {
    ...debugState,
    confirmedPlayerPosition: debugState.confirmedPlayerPosition
      ? { ...debugState.confirmedPlayerPosition }
      : null,
    cluePosition: debugState.cluePosition
      ? { ...debugState.cluePosition }
      : null,
    playerVector: debugState.playerVector
      ? { ...debugState.playerVector }
      : null,
    movementTarget: debugState.movementTarget
      ? { ...debugState.movementTarget }
      : null,
    attack: {
      ...debugState.attack,
      attackTarget: debugState.attack.attackTarget
        ? { ...debugState.attack.attackTarget }
        : null,
      guessedTarget: debugState.attack.guessedTarget
        ? { ...debugState.attack.guessedTarget }
        : null,
      salvoMoveTarget: debugState.attack.salvoMoveTarget
        ? { ...debugState.attack.salvoMoveTarget }
        : null,
    },
  }
}

export const indexForPoint = (width: number, point: Point): number => {
  return point.y * width + point.x
}

export const chebyshevDistance = (a: Point, b: Point): number => {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export const euclideanDistance = (a: Point, b: Point): number => {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export const bresenhamLine = (start: Point, end: Point): Point[] => {
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

export const createDeterministicRandom = (seed: string): () => number => {
  let state = hashSeed(seed) || 1

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 10_000) / 10_000
  }
}

export const hashSeed = (seed: string): number => {
  let hash = 2166136261

  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export const randomInteger = (
  random: () => number,
  min: number,
  max: number,
): number => {
  if (max <= min) {
    return min
  }

  return Math.floor(random() * (max - min + 1)) + min
}

export const randomChoice = <T>(values: T[], random: () => number): T => {
  return values[randomInteger(random, 0, values.length - 1)]
}

export const shufflePoints = (
  points: Point[],
  random: () => number,
): Point[] => {
  const next = points.map((point) => ({ ...point }))

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, 0, index)
    const temporary = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = temporary
  }

  return next
}

export const uniqueBoulders = (
  boulders: FallingBoulder[],
): FallingBoulder[] => {
  const seen = new Set<string>()

  return boulders.filter((boulder) => {
    const index = `${boulder.position.x}:${boulder.position.y}`

    if (seen.has(index)) {
      return false
    }

    seen.add(index)
    return true
  })
}

export const deltaForDirection = (direction: Direction): Point => {
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

export const horizontalFacingForMove = (
  current: HorizontalDirection,
  direction: Direction,
): HorizontalDirection => {
  if (direction === "left" || direction === "right") {
    return direction
  }

  return current
}

export const isNearObstacleBelow = (
  map: GeneratedMap,
  point: Point,
): boolean => {
  const probes = [
    { x: point.x - 1, y: point.y + 1 },
    { x: point.x, y: point.y + 1 },
    { x: point.x + 1, y: point.y + 1 },
  ]

  return probes.some((probe) => {
    const tile = tileAt(map, probe.x, probe.y)
    return !tile || tile === "wall"
  })
}

export const pointsEqual = (a: Point, b: Point): boolean => {
  return a.x === b.x && a.y === b.y
}

export const keyOfPoint = (point: Point): string => {
  return `${point.x}:${point.y}`
}
