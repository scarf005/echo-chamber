import {
  HOSTILE_MIN_CAPSULE_DISTANCE,
  HOSTILE_MIN_SPAWN_DISTANCE,
  HOSTILE_PLAYER_DETECTION_RADIUS,
  HOSTILE_SHOCKWAVE_DETECTION_RADIUS,
  HOSTILE_SPAWN_SEPARATION,
  HOSTILE_TORPEDO_COOLDOWN,
  HOSTILE_TORPEDO_RANGE,
  TORPEDO_SPEED,
} from "../constants.ts"
import {
  chebyshevDistance,
  createDeterministicRandom,
  keyOfPoint,
  pointsEqual,
  randomChoice,
  randomInteger,
  shufflePoints,
} from "../helpers.ts"
import type { HostileSubmarine, Shockwave, Torpedo } from "../model.ts"
import { isPassableTile, tileAt, type GeneratedMap, type Point } from "../mapgen.ts"

const CARDINAL_STEPS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function spawnHostileSubmarines(
  map: GeneratedMap,
  seed: string,
  count: number,
): HostileSubmarine[] {
  if (count <= 0) {
    return []
  }

  const random = createDeterministicRandom(`${seed}:hostile-spawns`)
  const candidates = shufflePoints(allWaterTiles(map), random)
  const hostileSubmarines: HostileSubmarine[] = []

  for (const point of candidates) {
    if (
      chebyshevDistance(point, map.spawn) < HOSTILE_MIN_SPAWN_DISTANCE ||
      chebyshevDistance(point, map.capsule) < HOSTILE_MIN_CAPSULE_DISTANCE ||
      hostileSubmarines.some((hostileSubmarine) =>
        chebyshevDistance(point, hostileSubmarine.position) < HOSTILE_SPAWN_SEPARATION
      )
    ) {
      continue
    }

    hostileSubmarines.push({
      id: `hostile-${hostileSubmarines.length + 1}`,
      position: point,
      facing: random() >= 0.5 ? "right" : "left",
      mode: "patrol",
      target: null,
      reload: randomInteger(random, 0, HOSTILE_TORPEDO_COOLDOWN),
    })

    if (hostileSubmarines.length >= count) {
      break
    }
  }

  return hostileSubmarines
}

export function stepHostileSubmarines(
  map: GeneratedMap,
  hostileSubmarines: HostileSubmarine[],
  player: Point,
  shockwaves: Shockwave[],
  seed: string,
  turn: number,
): {
  hostileSubmarines: HostileSubmarine[]
  launchedTorpedoes: Torpedo[]
  playerDestroyed: boolean
} {
  const nextHostileSubmarines: HostileSubmarine[] = []
  const launchedTorpedoes: Torpedo[] = []
  const occupied = new Set(hostileSubmarines.map((hostileSubmarine) => keyOfPoint(hostileSubmarine.position)))
  let playerDestroyed = false

  hostileSubmarines.forEach((hostileSubmarine, index) => {
    occupied.delete(keyOfPoint(hostileSubmarine.position))

    const random = createDeterministicRandom(`${seed}:hostile:${hostileSubmarine.id}:${turn}:${index}`)
    const nearestShockwave = findNearestShockwave(hostileSubmarine.position, shockwaves)
    const playerDetected = canDetectPlayer(map, hostileSubmarine.position, player)
    const sameRowShot = canFireAtPlayer(map, hostileSubmarine.position, player)
    let mode = hostileSubmarine.mode
    let target = hostileSubmarine.target ? { ...hostileSubmarine.target } : null
    let reload = Math.max(0, hostileSubmarine.reload - 1)
    let position = { ...hostileSubmarine.position }
    let facing = hostileSubmarine.facing

    if (nearestShockwave) {
      mode = "investigate"
      target = nearestShockwave
    }

    if (playerDetected || sameRowShot) {
      mode = "attack"
      target = { ...player }
    } else if (mode === "attack" && target) {
      mode = "investigate"
    }

    if (mode === "investigate" && target && pointsEqual(position, target)) {
      mode = "patrol"
      target = null
    }

    if (mode === "attack" && sameRowShot && reload === 0) {
      facing = player.x < position.x ? "left" : "right"
      launchedTorpedoes.push({
        position: { ...position },
        senderId: hostileSubmarine.id,
        direction: facing,
        speed: TORPEDO_SPEED,
        rangeRemaining: HOSTILE_TORPEDO_RANGE,
      })
      reload = HOSTILE_TORPEDO_COOLDOWN
    } else {
      const nextStep = mode === "patrol"
        ? choosePatrolStep(map, position, occupied, random)
        : target
        ? findNextStepToward(map, position, target, occupied)
        : null

      if (nextStep) {
        if (nextStep.x !== position.x) {
          facing = nextStep.x < position.x ? "left" : "right"
        }

        position = nextStep

        if (pointsEqual(position, player)) {
          playerDestroyed = true
        }

        if (mode === "investigate" && target && pointsEqual(position, target)) {
          mode = "patrol"
          target = null
        }
      }
    }

    occupied.add(keyOfPoint(position))
    nextHostileSubmarines.push({
      ...hostileSubmarine,
      position,
      facing,
      mode,
      target,
      reload,
    })
  })

  return {
    hostileSubmarines: nextHostileSubmarines,
    launchedTorpedoes,
    playerDestroyed,
  }
}

function allWaterTiles(map: GeneratedMap): Point[] {
  const points: Point[] = []

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      if (tileAt(map, x, y) === "water") {
        points.push({ x, y })
      }
    }
  }

  return points
}

function findNearestShockwave(position: Point, shockwaves: Shockwave[]): Point | null {
  let nearest: Point | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const shockwave of shockwaves) {
    if (!shockwave.damaging) {
      continue
    }

    const distance = chebyshevDistance(position, shockwave.origin)

    if (distance > HOSTILE_SHOCKWAVE_DETECTION_RADIUS || distance >= nearestDistance) {
      continue
    }

    nearest = shockwave.origin
    nearestDistance = distance
  }

  return nearest ? { ...nearest } : null
}

function canDetectPlayer(map: GeneratedMap, hostileSubmarine: Point, player: Point): boolean {
  return chebyshevDistance(hostileSubmarine, player) <= HOSTILE_PLAYER_DETECTION_RADIUS ||
    canFireAtPlayer(map, hostileSubmarine, player)
}

function canFireAtPlayer(map: GeneratedMap, hostileSubmarine: Point, player: Point): boolean {
  if (hostileSubmarine.y !== player.y || hostileSubmarine.x === player.x) {
    return false
  }

  const direction = player.x < hostileSubmarine.x ? -1 : 1

  for (let x = hostileSubmarine.x + direction; x !== player.x; x += direction) {
    if (tileAt(map, x, hostileSubmarine.y) !== "water") {
      return false
    }
  }

  return true
}

function choosePatrolStep(
  map: GeneratedMap,
  position: Point,
  occupied: Set<string>,
  random: () => number,
): Point | null {
  const options = shufflePoints(
    CARDINAL_STEPS.map((step) => ({ x: position.x + step.x, y: position.y + step.y })),
    random,
  ).filter((point) => isPassableTile(tileAt(map, point.x, point.y)) && !occupied.has(keyOfPoint(point)))

  return options.length > 0 ? randomChoice(options, random) : null
}

function findNextStepToward(
  map: GeneratedMap,
  start: Point,
  goal: Point,
  occupied: Set<string>,
): Point | null {
  const queue: Point[] = [{ ...start }]
  const parents = new Map<string, Point | null>()
  parents.set(keyOfPoint(start), null)

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    if (pointsEqual(current, goal)) {
      break
    }

    for (const next of orderedNeighbors(current, goal)) {
      const key = keyOfPoint(next)

      if (parents.has(key) || !isPassableTile(tileAt(map, next.x, next.y))) {
        continue
      }

      if (occupied.has(key) && !pointsEqual(next, goal)) {
        continue
      }

      parents.set(key, current)
      queue.push(next)
    }
  }

  if (!parents.has(keyOfPoint(goal))) {
    return null
  }

  let cursor = { ...goal }
  let parent = parents.get(keyOfPoint(cursor)) ?? null

  while (parent && !pointsEqual(parent, start)) {
    cursor = parent
    parent = parents.get(keyOfPoint(cursor)) ?? null
  }

  return pointsEqual(cursor, start) ? null : cursor
}

function orderedNeighbors(point: Point, goal: Point): Point[] {
  return CARDINAL_STEPS
    .map((step) => ({ x: point.x + step.x, y: point.y + step.y }))
    .sort((left, right) => distanceScore(left, goal) - distanceScore(right, goal))
}

function distanceScore(point: Point, goal: Point): number {
  return Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y)
}
