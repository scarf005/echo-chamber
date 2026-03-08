import {
  FISH_IDLE_MAX_TURNS,
  FISH_MIN_CAPSULE_DISTANCE,
  FISH_MIN_SPAWN_DISTANCE,
  FISH_SPAWN_SEPARATION,
  FISH_TRAVEL_MAX_TURNS,
  FISH_TRAVEL_MIN_DISTANCE,
} from "../constants.ts"
import {
  chebyshevDistance,
  createDeterministicRandom,
  keyOfPoint,
  randomInteger,
  shufflePoints,
} from "../helpers.ts"
import type { Fish, HostileSubmarine } from "../model.ts"
import {
  type GeneratedMap,
  isPassableTile,
  type Point,
  tileAt,
} from "../mapgen.ts"

const CARDINAL_STEPS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

interface FishTurnContext {
  player: Point
  hostileSubmarines: HostileSubmarine[]
}

interface ResolvedFish extends Fish {
  target: Point | null
  idleTurnsRemaining: number
  travelTurnsRemaining: number
}

export function spawnFish(
  map: GeneratedMap,
  seed: string,
  hostileSubmarines: HostileSubmarine[],
): Fish[] {
  if (hostileSubmarines.length <= 0) {
    return []
  }

  const random = createDeterministicRandom(`${seed}:fish-spawns`)
  const targetCount = hostileSubmarines.filter((hostileSubmarine) =>
    hostileSubmarine.archetype === "scout"
  ).length

  if (targetCount <= 0) {
    return []
  }

  const hostilePositions = hostileSubmarines.map((hostileSubmarine) => ({
    ...hostileSubmarine.position,
  }))
  const candidates = shufflePoints(allWaterTiles(map), random)
  const fish: Fish[] = []

  for (const point of candidates) {
    if (
      chebyshevDistance(point, map.spawn) < FISH_MIN_SPAWN_DISTANCE ||
      chebyshevDistance(point, map.capsule) < FISH_MIN_CAPSULE_DISTANCE ||
      hostilePositions.some((position) =>
        chebyshevDistance(point, position) < FISH_SPAWN_SEPARATION
      ) ||
      fish.some((candidate) =>
        chebyshevDistance(point, candidate.position) < FISH_SPAWN_SEPARATION
      )
    ) {
      continue
    }

    fish.push({
      id: `fish-${fish.length + 1}`,
      position: point,
      facing: random() >= 0.5 ? "right" : "left",
      mode: "idle",
      target: null,
      idleTurnsRemaining: randomInteger(random, 0, FISH_IDLE_MAX_TURNS),
      travelTurnsRemaining: 0,
    })

    if (fish.length >= targetCount) {
      break
    }
  }

  return fish
}

export function stepFish(
  map: GeneratedMap,
  fish: Fish[],
  context: FishTurnContext,
  seed: string,
  turn: number,
): {
  fish: Fish[]
  rammedFishCount: number
} {
  const currentFish = fish.map(hydrateFish)
  const occupied = new Set<string>([
    ...context.hostileSubmarines.map((hostileSubmarine) =>
      keyOfPoint(hostileSubmarine.position)
    ),
    ...currentFish.map((candidate) => keyOfPoint(candidate.position)),
  ])
  const nextFish: Fish[] = []
  let rammedFishCount = 0

  currentFish.forEach((candidate, index) => {
    occupied.delete(keyOfPoint(candidate.position))

    if (samePoint(candidate.position, context.player)) {
      rammedFishCount += 1
      return
    }

    const random = createDeterministicRandom(
      `${seed}:fish:${candidate.id}:${turn}:${index}`,
    )
    const nextCandidate = updateFish(map, candidate, context.player, occupied, random)

    if (!nextCandidate) {
      rammedFishCount += 1
      return
    }

    occupied.add(keyOfPoint(nextCandidate.position))
    nextFish.push(nextCandidate)
  })

  return { fish: nextFish, rammedFishCount }
}

function hydrateFish(fish: Fish): ResolvedFish {
  return {
    ...fish,
    target: fish.target ? { ...fish.target } : null,
    idleTurnsRemaining: fish.idleTurnsRemaining ?? 0,
    travelTurnsRemaining: fish.travelTurnsRemaining ?? 0,
  }
}

function updateFish(
  map: GeneratedMap,
  fish: ResolvedFish,
  player: Point,
  occupied: Set<string>,
  random: () => number,
): Fish | null {
  let position = { ...fish.position }
  let facing = fish.facing
  let mode = fish.mode
  let target = fish.target ? { ...fish.target } : null
  let idleTurnsRemaining = fish.idleTurnsRemaining
  let travelTurnsRemaining = fish.travelTurnsRemaining

  if (mode === "idle" && idleTurnsRemaining > 0) {
    return {
      ...fish,
      position,
      facing,
      mode,
      target,
      idleTurnsRemaining: idleTurnsRemaining - 1,
      travelTurnsRemaining,
    }
  }

  if (
    mode === "travel" &&
    target &&
    travelTurnsRemaining > 0 &&
    !samePoint(position, target)
  ) {
    const nextStep = findNextStepToward(map, position, target, occupied)

    if (nextStep) {
      if (nextStep.x !== position.x) {
        facing = nextStep.x < position.x ? "left" : "right"
      }

      if (samePoint(nextStep, player)) {
        return null
      }

      position = nextStep
      travelTurnsRemaining -= 1
    } else {
      travelTurnsRemaining = 0
      target = null
    }

    if (
      travelTurnsRemaining <= 0 ||
      (target && samePoint(position, target))
    ) {
      mode = "idle"
      target = null
      idleTurnsRemaining = randomInteger(random, 1, FISH_IDLE_MAX_TURNS)
      travelTurnsRemaining = 0
    }

    return {
      ...fish,
      position,
      facing,
      mode,
      target,
      idleTurnsRemaining,
      travelTurnsRemaining,
    }
  }

  const roll = random()

  if (roll < 0.34) {
    return {
      ...fish,
      position,
      facing,
      mode: "idle",
      target: null,
      idleTurnsRemaining: randomInteger(random, 1, FISH_IDLE_MAX_TURNS),
      travelTurnsRemaining: 0,
    }
  }

  if (roll < 0.67) {
    const nextStep = chooseWanderStep(map, position, occupied, random)

    if (nextStep) {
      if (nextStep.x !== position.x) {
        facing = nextStep.x < position.x ? "left" : "right"
      }

      if (samePoint(nextStep, player)) {
        return null
      }

      position = nextStep
    }

    return {
      ...fish,
      position,
      facing,
      mode: "wander",
      target: null,
      idleTurnsRemaining: 0,
      travelTurnsRemaining: 0,
    }
  }

  target = chooseTravelTarget(map, position, occupied, random)

  if (!target) {
    return {
      ...fish,
      position,
      facing,
      mode: "idle",
      target: null,
      idleTurnsRemaining: 1,
      travelTurnsRemaining: 0,
    }
  }

  const nextStep = findNextStepToward(map, position, target, occupied)

  if (nextStep) {
    if (nextStep.x !== position.x) {
      facing = nextStep.x < position.x ? "left" : "right"
    }

    if (samePoint(nextStep, player)) {
      return null
    }

    position = nextStep
  }

  return {
    ...fish,
    position,
    facing,
    mode: "travel",
    target,
    idleTurnsRemaining: 0,
    travelTurnsRemaining: FISH_TRAVEL_MAX_TURNS - 1,
  }
}

function chooseWanderStep(
  map: GeneratedMap,
  position: Point,
  occupied: Set<string>,
  random: () => number,
): Point | null {
  const options = shufflePoints(
    CARDINAL_STEPS.map((step) => ({
      x: position.x + step.x,
      y: position.y + step.y,
    })),
    random,
  ).filter((candidate) =>
    isPassableTile(tileAt(map, candidate.x, candidate.y)) &&
    !occupied.has(keyOfPoint(candidate))
  )

  return options[0] ?? null
}

function chooseTravelTarget(
  map: GeneratedMap,
  position: Point,
  occupied: Set<string>,
  random: () => number,
): Point | null {
  const candidates = shufflePoints(allWaterTiles(map), random)

  for (const candidate of candidates) {
    if (
      samePoint(candidate, position) ||
      occupied.has(keyOfPoint(candidate)) ||
      chebyshevDistance(position, candidate) < FISH_TRAVEL_MIN_DISTANCE
    ) {
      continue
    }

    const path = findPathToward(map, position, candidate, occupied)

    if (path.length > 1) {
      return candidate
    }
  }

  return null
}

function findNextStepToward(
  map: GeneratedMap,
  start: Point,
  goal: Point,
  occupied: Set<string>,
): Point | null {
  const path = findPathToward(map, start, goal, occupied)
  return path.length > 1 ? path[1] : null
}

function findPathToward(
  map: GeneratedMap,
  start: Point,
  goal: Point,
  occupied: Set<string>,
): Point[] {
  const queue: Point[] = [{ ...start }]
  const parents = new Map<string, Point | null>()
  parents.set(keyOfPoint(start), null)

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    if (samePoint(current, goal)) {
      break
    }

    for (const next of orderedNeighbors(current, goal)) {
      const key = keyOfPoint(next)

      if (parents.has(key) || !isPassableTile(tileAt(map, next.x, next.y))) {
        continue
      }

      if (occupied.has(key) && !samePoint(next, goal)) {
        continue
      }

      parents.set(key, current)
      queue.push(next)
    }
  }

  if (!parents.has(keyOfPoint(goal))) {
    return [{ ...start }]
  }

  const path: Point[] = []
  let cursor: Point | null = { ...goal }

  while (cursor) {
    path.push(cursor)
    cursor = parents.get(keyOfPoint(cursor)) ?? null
  }

  path.reverse()
  return path
}

function orderedNeighbors(point: Point, goal: Point): Point[] {
  return CARDINAL_STEPS
    .map((step) => ({ x: point.x + step.x, y: point.y + step.y }))
    .sort((left, right) =>
      distanceScore(left, goal) - distanceScore(right, goal)
    )
}

function distanceScore(point: Point, goal: Point): number {
  return Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y)
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

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y
}
