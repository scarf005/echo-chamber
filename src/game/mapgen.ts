import { Map as RotMap, RNG } from "npm:rot-js@2.2.1"

export type TileKind = "wall" | "water" | "kelp"
export type BiomeKind = "vast" | "regular" | "tight" | "chaotic" | "wavy"

export interface Point {
  x: number
  y: number
}

export interface MapMetadata {
  mainRouteLength: number
  smoothingIterations: number
  wallProbability: number
  topology: 4 | 6 | 8
  openTileRatio: number
  biomes: BiomeKind[]
}

export interface GeneratedMap {
  width: number
  height: number
  tiles: TileKind[]
  spawn: Point
  capsule: Point
  seed: string
  metadata: MapMetadata
}

export interface MapGenOptions {
  width?: number
  height?: number
  seed?: number | string
  smoothingIterations?: number
  wallProbability?: number
  topology?: 4 | 6 | 8
  biomes?: BiomeKind[]
}

const DEFAULT_WIDTH = 64
const DEFAULT_HEIGHT = 28
const DEFAULT_SEED = "echo-chamber"
const DEFAULT_ITERATIONS = 4
const DEFAULT_WALL_PROBABILITY = 0.5
const DEFAULT_TOPOLOGY = 8
const MIN_WIDTH = 24
const MIN_HEIGHT = 16
const DIRECTIONS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function generateMap(options: MapGenOptions = {}): GeneratedMap {
  const width = clampInteger(options.width ?? DEFAULT_WIDTH, MIN_WIDTH, 160)
  const height = clampInteger(options.height ?? DEFAULT_HEIGHT, MIN_HEIGHT, 96)
  const seed = normalizeSeed(options.seed)
  const smoothingIterations = clampInteger(
    options.smoothingIterations ?? DEFAULT_ITERATIONS,
    1,
    8,
  )
  const wallProbability = clamp(
    options.wallProbability ?? DEFAULT_WALL_PROBABILITY,
    0.2,
    0.75,
  )
  const topology = options.topology ?? DEFAULT_TOPOLOGY
  const interiorWidth = width - 2
  const interiorHeight = height - 2
  const tiles = Array<TileKind>(width * height).fill("wall")
  const previousRngState = RNG.getState()

  try {
    RNG.setSeed(Math.max(1, hashSeed(seed)))

    const cellular = new RotMap.Cellular(interiorWidth, interiorHeight, {
      topology,
    })

    cellular.randomize(wallProbability)

    for (let iteration = 0; iteration < smoothingIterations; iteration += 1) {
      cellular.create()
    }

    let freeCells = 0

    cellular.connect((x: number, y: number, value: number) => {
      const tile = value === 1 ? "wall" : "water"
      tiles[indexForTile(width, x + 1, y + 1)] = tile

      if (tile === "water") {
        freeCells += 1
      }
    }, 0)

    if (freeCells === 0) {
      carveFallbackRoute(
        tiles,
        width,
        height,
        { x: 2, y: Math.floor(height / 2) },
        { x: width - 3, y: Math.floor(height / 2) },
      )
    }
  } finally {
    RNG.setState(previousRngState)
  }

  enforceBorderWalls(tiles, width, height)

  let spawn = findEdgeAnchor(tiles, width, height, "left")
  let capsule = findEdgeAnchor(tiles, width, height, "right")

  if (!spawn) {
    spawn = { x: 2, y: Math.floor(height / 2) }
    carveDisc(tiles, width, height, spawn, 1)
  }

  if (!capsule || isSamePoint(spawn, capsule)) {
    capsule = { x: width - 3, y: Math.floor(height / 2) }
    carveDisc(tiles, width, height, capsule, 1)
  }

  carveDisc(tiles, width, height, spawn, 1)
  carveDisc(tiles, width, height, capsule, 1)

  if (!hasPath(tiles, width, height, spawn, capsule)) {
    carveFallbackRoute(tiles, width, height, spawn, capsule)
  }

  addKelpOnRock(tiles, width, height, seed, [spawn, capsule])

  const routeLength =
    computeRouteLength(tiles, width, height, spawn, capsule) ?? 0
  const openTiles = tiles.reduce(
    (count, tile) => count + (isPassableTile(tile) ? 1 : 0),
    0,
  )

  return {
    width,
    height,
    tiles,
    spawn,
    capsule,
    seed,
    metadata: {
      mainRouteLength: routeLength,
      smoothingIterations,
      wallProbability: Number(wallProbability.toFixed(2)),
      topology,
      openTileRatio: Number((openTiles / tiles.length).toFixed(3)),
      biomes: ["regular"],
    },
  }
}

export function tileAt(
  map: GeneratedMap,
  x: number,
  y: number,
): TileKind | null {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
    return null
  }

  return map.tiles[indexForTile(map.width, x, y)]
}

export function isPassableTile(tile: TileKind | null): boolean {
  return tile === "water" || tile === "kelp"
}

export function isSonarBlockingTile(tile: TileKind | null): boolean {
  return tile === "wall" || tile === "kelp"
}

export function clearKelpStrandAt(map: GeneratedMap, point: Point): boolean {
  if (tileAt(map, point.x, point.y) !== "kelp") {
    return false
  }

  let cleared = false

  for (let y = point.y; y >= 0; y -= 1) {
    if (tileAt(map, point.x, y) !== "kelp") {
      break
    }

    map.tiles[indexForTile(map.width, point.x, y)] = "water"
    cleared = true
  }

  return cleared
}

export function mapToAscii(map: GeneratedMap): string {
  const rows: string[] = []

  for (let y = 0; y < map.height; y += 1) {
    let row = ""

    for (let x = 0; x < map.width; x += 1) {
      if (x === map.spawn.x && y === map.spawn.y) {
        row += "S"
        continue
      }

      if (x === map.capsule.x && y === map.capsule.y) {
        row += "C"
        continue
      }

      const tile = tileAt(map, x, y)
      row += tile === "wall" ? "#" : tile === "kelp" ? '"' : "."
    }

    rows.push(row)
  }

  return rows.join("\n")
}

export function carveDisc(
  tiles: TileKind[],
  width: number,
  height: number,
  center: Point,
  radius: number,
): void {
  const radiusSquared = radius * radius

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (!isInterior(width, height, x, y)) {
        continue
      }

      const distanceSquared = (x - center.x) ** 2 + (y - center.y) ** 2

      if (distanceSquared <= radiusSquared) {
        tiles[indexForTile(width, x, y)] = "water"
      }
    }
  }
}

export function carveLine(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  end: Point,
  radius: number,
): void {
  const steps = Math.max(
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y),
    1,
  )

  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps
    carveDisc(
      tiles,
      width,
      height,
      {
        x: Math.round(lerp(start.x, end.x, amount)),
        y: Math.round(lerp(start.y, end.y, amount)),
      },
      radius,
    )
  }
}

function findEdgeAnchor(
  tiles: TileKind[],
  width: number,
  height: number,
  side: "left" | "right",
): Point | null {
  let bestPoint: Point | null = null
  let bestScore = Number.POSITIVE_INFINITY
  const midpoint = Math.floor(height / 2)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!isPassableTile(tiles[indexForTile(width, x, y)])) {
        continue
      }

      const edgeDistance = side === "left" ? x : width - 1 - x
      const score = edgeDistance * 1000 + Math.abs(y - midpoint)

      if (score < bestScore) {
        bestScore = score
        bestPoint = { x, y }
      }
    }
  }

  return bestPoint
}

function carveFallbackRoute(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  end: Point,
): void {
  carveLine(tiles, width, height, start, end, 1)
  carveDisc(tiles, width, height, start, 1)
  carveDisc(tiles, width, height, end, 1)
}

function addKelpOnRock(
  tiles: TileKind[],
  width: number,
  height: number,
  seed: string,
  protectedPoints: Point[],
): void {
  for (let y = 2; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const anchorIndex = indexForTile(width, x, y)

      if (tiles[anchorIndex] !== "water") {
        continue
      }

      if (tiles[indexForTile(width, x, y + 1)] !== "wall") {
        continue
      }

      if (isProtectedKelpPoint(x, y, protectedPoints)) {
        continue
      }

      if (kelpHash(seed, x, y) > 0.2) {
        continue
      }

      const strandHeight = 1 + Math.floor(kelpHash(seed, x + width, y + height) * 3)

      for (let offset = 0; offset < strandHeight; offset += 1) {
        const kelpY = y - offset

        if (kelpY <= 0) {
          break
        }

        if (isProtectedKelpPoint(x, kelpY, protectedPoints)) {
          break
        }

        const kelpIndex = indexForTile(width, x, kelpY)

        if (tiles[kelpIndex] !== "water") {
          break
        }

        tiles[kelpIndex] = "kelp"
      }
    }
  }
}

function enforceBorderWalls(
  tiles: TileKind[],
  width: number,
  height: number,
): void {
  for (let x = 0; x < width; x += 1) {
    tiles[indexForTile(width, x, 0)] = "wall"
    tiles[indexForTile(width, x, height - 1)] = "wall"
  }

  for (let y = 0; y < height; y += 1) {
    tiles[indexForTile(width, 0, y)] = "wall"
    tiles[indexForTile(width, width - 1, y)] = "wall"
  }
}

function hasPath(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  end: Point,
): boolean {
  return computeRouteLength(tiles, width, height, start, end) !== null
}

function computeRouteLength(
  tiles: TileKind[],
  width: number,
  height: number,
  start: Point,
  end: Point,
): number | null {
  const queue: Array<{ point: Point; distance: number }> = [{
    point: { ...start },
    distance: 0,
  }]
  const seen = new Set<number>()

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    const index = indexForTile(width, current.point.x, current.point.y)

    if (seen.has(index)) {
      continue
    }

    seen.add(index)

    if (isSamePoint(current.point, end)) {
      return current.distance
    }

    for (const direction of DIRECTIONS) {
      const next = {
        x: current.point.x + direction.x,
        y: current.point.y + direction.y,
      }

      if (!isInterior(width, height, next.x, next.y)) {
        continue
      }

      if (isPassableTile(tiles[indexForTile(width, next.x, next.y)])) {
        queue.push({ point: next, distance: current.distance + 1 })
      }
    }
  }

  return null
}

function indexForTile(width: number, x: number, y: number): number {
  return y * width + x
}

function isInterior(width: number, height: number, x: number, y: number): boolean {
  return x > 0 && x < width - 1 && y > 0 && y < height - 1
}

function isSamePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function isProtectedKelpPoint(x: number, y: number, protectedPoints: Point[]): boolean {
  return protectedPoints.some((point) => point.x === x && point.y === y)
}

function normalizeSeed(seed: number | string | undefined): string {
  if (seed === undefined) {
    return DEFAULT_SEED
  }

  return String(seed)
}

function hashSeed(seed: string): number {
  let hash = 2166136261

  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function kelpHash(seed: string, x: number, y: number): number {
  return hashSeed(`${seed}:kelp:${x}:${y}`) / 0xffffffff
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max))
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}
