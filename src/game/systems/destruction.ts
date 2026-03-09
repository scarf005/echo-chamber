import {
  BOULDER_FALL_SPEED,
  STRUCTURAL_DAMAGE_COLLAPSE_FACTOR,
  TORPEDO_BLAST_RADIUS,
} from "../constants.ts"
import { createDustBurst, mergeFadeCells } from "../effects.ts"
import {
  createDeterministicRandom,
  indexForPoint,
  randomChoice,
  randomInteger,
  shufflePoints,
  uniqueBoulders,
} from "../helpers.ts"
import type { CrackCell, FadeCell, FallingBoulder } from "../model.ts"
import { carveDisc, type GeneratedMap, type Point, tileAt } from "../mapgen.ts"

const MAX_FLOATING_COMPONENT_TILES = 35
const FLOATING_COMPONENT_RELEASE_DISTANCE = 4

export const detonateTorpedo = (
  map: GeneratedMap,
  impactPoint: Point,
  seedKey: string,
  structuralDamage: number[],
): {
  cracks: CrackCell[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  screenShake: number
  structuralDamage: number[]
} => {
  const random = createDeterministicRandom(seedKey)
  const cracks: CrackCell[] = []
  const collapseSeeds: Point[] = [{ ...impactPoint }]
  let dust = createDustBurst(map, impactPoint, 0.7)
  let fallingBoulders: FallingBoulder[] = []
  const nextStructuralDamage = structuralDamage.slice()
  const impactCanDislodge = canDislodgeBoulder(map, impactPoint)

  carveDisc(map.tiles, map.width, map.height, impactPoint, TORPEDO_BLAST_RADIUS)

  if (impactCanDislodge) {
    nextStructuralDamage[indexForPoint(map.width, impactPoint)] = 0
    fallingBoulders.push({
      position: { ...impactPoint },
      speed: BOULDER_FALL_SPEED,
    })
  }

  for (let index = 0; index < 3; index += 1) {
    const direction = randomChoice(baseCrackDirections(), random)
    const center = {
      x: impactPoint.x +
        direction.x * randomInteger(random, 1, TORPEDO_BLAST_RADIUS),
      y: impactPoint.y +
        direction.y * randomInteger(random, 1, TORPEDO_BLAST_RADIUS),
    }
    carveDisc(map.tiles, map.width, map.height, center, 1)
  }

  for (const direction of crackDirections(random)) {
    const length = randomInteger(random, 2, 5)

    for (let distance = 1; distance <= length; distance += 1) {
      const point = {
        x: impactPoint.x + direction.x * distance,
        y: impactPoint.y + direction.y * distance,
      }
      const tile = tileAt(map, point.x, point.y)

      if (!tile) {
        break
      }

      if (tile !== "wall") {
        continue
      }

      cracks.push({
        index: indexForPoint(map.width, point),
        alpha: Number((0.95 - distance * 0.12).toFixed(3)),
        glyph: crackGlyphForDirection(direction),
      })
      collapseSeeds.push({ ...point })

      if (canDislodgeBoulder(map, point) && random() > 0.25) {
        map.tiles[indexForPoint(map.width, point)] = "water"
        nextStructuralDamage[indexForPoint(map.width, point)] = 0
        fallingBoulders.push({
          position: { ...point },
          speed: BOULDER_FALL_SPEED,
        })
      }
    }
  }

  fallingBoulders = [
    ...fallingBoulders,
    ...releaseFloatingTerrain(map, collapseSeeds, nextStructuralDamage),
  ]
  applyStructuralDamageSeed(map, nextStructuralDamage, collapseSeeds)
  dust = mergeFadeCells(
    dust,
    fallingBoulders.flatMap((boulder) =>
      createDustBurst(map, boulder.position, 0.42)
    ),
  )
  const uniqueFallingBoulders = uniqueBoulders(fallingBoulders)

  return {
    cracks,
    dust,
    fallingBoulders: uniqueFallingBoulders,
    screenShake: 1.1 + Math.min(1.4, uniqueFallingBoulders.length * 0.04),
    structuralDamage: nextStructuralDamage,
  }
}

const canDislodgeBoulder = (map: GeneratedMap, point: Point): boolean => {
  if (
    point.x <= 0 || point.x >= map.width - 1 || point.y <= 0 ||
    point.y >= map.height - 2
  ) {
    return false
  }

  return tileAt(map, point.x, point.y) === "wall" &&
    tileAt(map, point.x, point.y + 1) === "water"
}

const crackDirections = (random: () => number): Point[] => {
  const extras = shufflePoints([
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ], random)

  return [{ x: 0, y: -1 }, { x: 0, y: 1 }, ...extras.slice(0, 2)]
}

const crackGlyphForDirection = (direction: Point): string => {
  if (direction.x === 0) {
    return "|"
  }

  if (direction.y === 0) {
    return "-"
  }

  return direction.x === direction.y ? "\\" : "/"
}

const baseCrackDirections = (): Point[] => {
  return [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ]
}

const releaseFloatingTerrain = (
  map: GeneratedMap,
  seeds: Point[],
  structuralDamage: number[],
): FallingBoulder[] => {
  const connected = new Set<number>()
  const visited = new Set<number>()
  const queue: Point[] = []

  for (let x = 0; x < map.width; x += 1) {
    pushBorderWall(map, connected, queue, { x, y: 0 })
    pushBorderWall(map, connected, queue, { x, y: map.height - 1 })
  }

  for (let y = 1; y < map.height - 1; y += 1) {
    pushBorderWall(map, connected, queue, { x: 0, y })
    pushBorderWall(map, connected, queue, { x: map.width - 1, y })
  }

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    for (const neighbor of wallNeighbors(current)) {
      if (
        neighbor.x < 0 || neighbor.x >= map.width || neighbor.y < 0 ||
        neighbor.y >= map.height
      ) {
        continue
      }

      const index = indexForPoint(map.width, neighbor)

      if (
        connected.has(index) || tileAt(map, neighbor.x, neighbor.y) !== "wall"
      ) {
        continue
      }

      connected.add(index)
      queue.push(neighbor)
    }
  }

  const fallingBoulders: FallingBoulder[] = []

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      const candidate = { x, y }
      const index = indexForPoint(map.width, candidate)

      if (
        visited.has(index) || connected.has(index) ||
        tileAt(map, x, y) !== "wall"
      ) {
        continue
      }

      const component = collectWallComponent(map, candidate, connected)

      for (const cellIndex of component) {
        visited.add(cellIndex)
      }

      if (
        component.length === 0 ||
        !canReleaseWallComponent(component, structuralDamage) ||
        !componentTouchesSeedArea(component, map.width, seeds)
      ) {
        continue
      }

      for (const cellIndex of component) {
        const point = {
          x: cellIndex % map.width,
          y: Math.floor(cellIndex / map.width),
        }
        map.tiles[cellIndex] = "water"
        structuralDamage[cellIndex] = 0
        fallingBoulders.push({
          position: point,
          speed: BOULDER_FALL_SPEED,
        })
      }
    }
  }

  return fallingBoulders
}

const applyStructuralDamageSeed = (
  map: GeneratedMap,
  structuralDamage: number[],
  seeds: Point[],
): void => {
  for (const seed of seeds) {
    for (const point of [seed, ...wallNeighbors(seed)]) {
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x >= map.width ||
        point.y >= map.height
      ) {
        continue
      }

      if (tileAt(map, point.x, point.y) === "wall") {
        structuralDamage[indexForPoint(map.width, point)] += 1
        return
      }
    }
  }
}

const canReleaseWallComponent = (
  component: number[],
  structuralDamage: number[],
): boolean => {
  if (component.length <= MAX_FLOATING_COMPONENT_TILES) {
    return true
  }

  const damage = component.reduce(
    (total, cellIndex) => total + structuralDamage[cellIndex],
    0,
  )

  return damage > 0 &&
    STRUCTURAL_DAMAGE_COLLAPSE_FACTOR * damage > component.length
}

const collectWallComponent = (
  map: GeneratedMap,
  start: Point,
  connected: Set<number>,
): number[] => {
  const component: number[] = []
  const queue = [{ ...start }]
  const seen = new Set<number>()

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    const index = indexForPoint(map.width, current)

    if (
      seen.has(index) || connected.has(index) ||
      tileAt(map, current.x, current.y) !== "wall"
    ) {
      continue
    }

    seen.add(index)
    component.push(index)

    for (const neighbor of wallNeighbors(current)) {
      if (
        neighbor.x <= 0 || neighbor.x >= map.width - 1 || neighbor.y <= 0 ||
        neighbor.y >= map.height - 1
      ) {
        continue
      }

      if (tileAt(map, neighbor.x, neighbor.y) === "wall") {
        queue.push(neighbor)
      }
    }
  }

  return component
}

const componentTouchesSeedArea = (
  component: number[],
  width: number,
  seeds: Point[],
): boolean => {
  return component.some((cellIndex) => {
    const point = {
      x: cellIndex % width,
      y: Math.floor(cellIndex / width),
    }

    return seeds.some((seed) => (
      Math.max(Math.abs(point.x - seed.x), Math.abs(point.y - seed.y)) <=
        FLOATING_COMPONENT_RELEASE_DISTANCE
    ))
  })
}

const pushBorderWall = (
  map: GeneratedMap,
  connected: Set<number>,
  queue: Point[],
  point: Point,
): void => {
  if (tileAt(map, point.x, point.y) !== "wall") {
    return
  }

  const index = indexForPoint(map.width, point)

  if (connected.has(index)) {
    return
  }

  connected.add(index)
  queue.push(point)
}

const wallNeighbors = (point: Point): Point[] => {
  return [
    { x: point.x - 1, y: point.y - 1 },
    { x: point.x, y: point.y - 1 },
    { x: point.x + 1, y: point.y - 1 },
    { x: point.x - 1, y: point.y },
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y + 1 },
    { x: point.x, y: point.y + 1 },
    { x: point.x + 1, y: point.y + 1 },
  ]
}
