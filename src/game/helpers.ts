import { tileAt, type GeneratedMap, type Point } from "./mapgen.ts"
import type {
  DepthCharge,
  Direction,
  FallingBoulder,
  HostileSubmarine,
  HorizontalDirection,
  Torpedo,
} from "./model.ts"

export function cloneMap(map: GeneratedMap): GeneratedMap {
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

export function cloneTorpedo(torpedo: Torpedo): Torpedo {
  return {
    ...torpedo,
    position: { ...torpedo.position },
  }
}

export function cloneDepthCharge(depthCharge: DepthCharge): DepthCharge {
  return {
    ...depthCharge,
    position: { ...depthCharge.position },
  }
}

export function cloneBoulder(boulder: FallingBoulder): FallingBoulder {
  return {
    ...boulder,
    position: { ...boulder.position },
  }
}

export function cloneHostileSubmarine(hostileSubmarine: HostileSubmarine): HostileSubmarine {
  return {
    ...hostileSubmarine,
    position: { ...hostileSubmarine.position },
    target: hostileSubmarine.target ? { ...hostileSubmarine.target } : null,
  }
}

export function indexForPoint(width: number, point: Point): number {
  return point.y * width + point.x
}

export function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export function euclideanDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function bresenhamLine(start: Point, end: Point): Point[] {
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

export function createDeterministicRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 10_000) / 10_000
  }
}

export function hashSeed(seed: string): number {
  let hash = 2166136261

  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function randomInteger(random: () => number, min: number, max: number): number {
  if (max <= min) {
    return min
  }

  return Math.floor(random() * (max - min + 1)) + min
}

export function randomChoice<T>(values: T[], random: () => number): T {
  return values[randomInteger(random, 0, values.length - 1)]
}

export function shufflePoints(points: Point[], random: () => number): Point[] {
  const next = points.map((point) => ({ ...point }))

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, 0, index)
    const temporary = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = temporary
  }

  return next
}

export function uniqueBoulders(boulders: FallingBoulder[]): FallingBoulder[] {
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

export function deltaForDirection(direction: Direction): Point {
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

export function horizontalFacingForMove(
  current: HorizontalDirection,
  direction: Direction,
): HorizontalDirection {
  if (direction === "left" || direction === "right") {
    return direction
  }

  return current
}

export function isNearObstacleBelow(map: GeneratedMap, point: Point): boolean {
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

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function keyOfPoint(point: Point): string {
  return `${point.x}:${point.y}`
}
