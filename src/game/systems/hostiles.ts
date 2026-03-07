import {
  DEPTH_CHARGE_RANGE,
  DEPTH_CHARGE_SPEED,
  HOSTILE_COMMUNICATION_RADIUS,
  HOSTILE_HUNTER_SONAR_INTERVAL,
  HOSTILE_MIN_CAPSULE_DISTANCE,
  HOSTILE_MIN_SPAWN_DISTANCE,
  HOSTILE_PLAYER_CLUE_RADIUS,
  HOSTILE_PLAYER_DETECTION_RADIUS,
  HOSTILE_SCOUT_ALERT_SONAR_INTERVAL,
  HOSTILE_SCOUT_SONAR_INTERVAL,
  HOSTILE_SHOCKWAVE_DETECTION_RADIUS,
  HOSTILE_SPAWN_SEPARATION,
  HOSTILE_TORPEDO_COOLDOWN,
  HOSTILE_TORPEDO_RANGE,
  HOSTILE_TURTLE_VISUAL_RADIUS,
  SONAR_ENTITY_IDENTIFY_RADIUS,
  SONAR_SPEED,
  TORPEDO_SPEED,
} from "../constants.ts"
import { FOV } from "npm:rot-js@2.2.1"

import {
  chebyshevDistance,
  createDeterministicRandom,
  deltaForDirection,
  indexForPoint,
  keyOfPoint,
  pointsEqual,
  randomInteger,
  shufflePoints,
} from "../helpers.ts"
import type {
  DepthCharge,
  Direction,
  FadeCell,
  HostileSubmarine,
  HostileSubmarineArchetype,
  HostileSubmarineMode,
  Shockwave,
  Torpedo,
} from "../model.ts"
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

interface HostileTurnContext {
  player: Point
  previousPlayer: Point
  shockwaves: Shockwave[]
  trails: FadeCell[]
  memory: Array<"wall" | "water" | null>
  playerSonarHitHostiles: ReadonlySet<string>
}

interface ResolvedHostileSubmarine extends HostileSubmarine {
  archetype: HostileSubmarineArchetype
  initialPosition: Point
  torpedoAmmo: number
  vlsAmmo: number
  depthChargeAmmo: number
  lastSonarTurn: number
  lastKnownPlayerPosition: Point | null
  lastKnownPlayerVector: Point | null
  lastKnownPlayerTurn: number | null
  plannedPath: Point[]
  salvoShotsRemaining: number
  salvoStepDirection: "up" | "down" | null
  salvoMoveTarget: Point | null
}

interface HostileKnowledge {
  confirmedPlayerPosition: Point | null
  cluePosition: Point | null
  playerVector: Point | null
  directDetection: boolean
  detectedByPlayerSonar: boolean
  receivedImmediateRelay: boolean
}

interface AttackResolution {
  torpedoes: Torpedo[]
  depthCharges: DepthCharge[]
  reload: number
  torpedoAmmo: number
  vlsAmmo: number
  depthChargeAmmo: number
  salvoShotsRemaining: number
  salvoStepDirection: "up" | "down" | null
  salvoMoveTarget: Point | null
}

interface Loadout {
  torpedoAmmo: number
  vlsAmmo: number
  depthChargeAmmo: number
}

const SCOUT_LOADOUT: Loadout = {
  torpedoAmmo: 2,
  vlsAmmo: 2,
  depthChargeAmmo: 2,
}

const HUNTER_LOADOUT: Loadout = {
  torpedoAmmo: 6,
  vlsAmmo: 6,
  depthChargeAmmo: 6,
}

const TURTLE_LOADOUT: Loadout = {
  torpedoAmmo: 4,
  vlsAmmo: 4,
  depthChargeAmmo: 4,
}

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
        chebyshevDistance(point, hostileSubmarine.position) <
          HOSTILE_SPAWN_SEPARATION
      )
    ) {
      continue
    }

    const archetype = chooseArchetype(random)
    const loadout = loadoutForArchetype(archetype)
    hostileSubmarines.push({
      id: `hostile-${hostileSubmarines.length + 1}`,
      position: point,
      initialPosition: { ...point },
      facing: random() >= 0.5 ? "right" : "left",
      mode: archetype === "turtle" ? "patrol" : "investigate",
      target: null,
      reload: randomInteger(random, 0, HOSTILE_TORPEDO_COOLDOWN),
      archetype,
      torpedoAmmo: loadout.torpedoAmmo,
      vlsAmmo: loadout.vlsAmmo,
      depthChargeAmmo: loadout.depthChargeAmmo,
      lastSonarTurn: 0,
      lastKnownPlayerPosition: null,
      lastKnownPlayerVector: null,
      lastKnownPlayerTurn: null,
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
  context: HostileTurnContext,
  seed: string,
  turn: number,
): {
  hostileSubmarines: HostileSubmarine[]
  launchedTorpedoes: Torpedo[]
  launchedDepthCharges: DepthCharge[]
  spawnedShockwaves: Shockwave[]
  playerDestroyed: boolean
} {
  const currentHostiles = hostileSubmarines.map(hydrateHostileSubmarine)
  const availableShockwaves = context.shockwaves.map((shockwave) => ({
    ...shockwave,
    origin: { ...shockwave.origin },
    ...(shockwave.message
      ? {
        message: {
          ...shockwave.message,
          position: { ...shockwave.message.position },
        },
      }
      : {}),
  }))
  const nextHostileSubmarines: HostileSubmarine[] = []
  const launchedTorpedoes: Torpedo[] = []
  const launchedDepthCharges: DepthCharge[] = []
  const spawnedShockwaves: Shockwave[] = []
  const occupied = new Set(
    currentHostiles.map((hostileSubmarine) =>
      keyOfPoint(hostileSubmarine.position)
    ),
  )
  const baseKnowledge = new Map(
    currentHostiles.map((hostileSubmarine) => [
      hostileSubmarine.id,
      gatherKnowledge(
        map,
        hostileSubmarine,
        currentHostiles,
        {
          ...context,
          shockwaves: availableShockwaves,
        },
      ),
    ]),
  )
  const relayedPlayerFixes = propagateImmediatePlayerFixes(
    currentHostiles,
    baseKnowledge,
  )
  let playerDestroyed = false

  currentHostiles.forEach((hostileSubmarine, index) => {
    occupied.delete(keyOfPoint(hostileSubmarine.position))

    const random = createDeterministicRandom(
      `${seed}:hostile:${hostileSubmarine.id}:${turn}:${index}`,
    )
    const base = baseKnowledge.get(hostileSubmarine.id)

    if (!base) {
      throw new Error(`Missing hostile knowledge for ${hostileSubmarine.id}`)
    }

    const relayFix = relayedPlayerFixes.get(hostileSubmarine.id)
    const knowledge = relayFix && !base.confirmedPlayerPosition
      ? {
        ...base,
        confirmedPlayerPosition: relayFix,
        cluePosition: relayFix,
        receivedImmediateRelay: true,
      }
      : base
    let archetype = hostileSubmarine.archetype
    let position = { ...hostileSubmarine.position }
    let facing = hostileSubmarine.facing
    let reload = Math.max(0, hostileSubmarine.reload - 1)
    let mode = hostileSubmarine.mode
    let target = hostileSubmarine.target ? { ...hostileSubmarine.target } : null
    let lastSonarTurn = hostileSubmarine.lastSonarTurn
    let lastKnownPlayerPosition = hostileSubmarine.lastKnownPlayerPosition
      ? { ...hostileSubmarine.lastKnownPlayerPosition }
      : null
    let lastKnownPlayerVector = hostileSubmarine.lastKnownPlayerVector
      ? { ...hostileSubmarine.lastKnownPlayerVector }
      : null
    let lastKnownPlayerTurn = hostileSubmarine.lastKnownPlayerTurn
    let torpedoAmmo = hostileSubmarine.torpedoAmmo
    let vlsAmmo = hostileSubmarine.vlsAmmo
    let depthChargeAmmo = hostileSubmarine.depthChargeAmmo
    let plannedPath = hostileSubmarine.plannedPath.map((point) => ({
      ...point,
    }))
    let salvoShotsRemaining = hostileSubmarine.salvoShotsRemaining
    let salvoStepDirection = hostileSubmarine.salvoStepDirection
    let salvoMoveTarget = hostileSubmarine.salvoMoveTarget
      ? { ...hostileSubmarine.salvoMoveTarget }
      : null

    if (knowledge.confirmedPlayerPosition) {
      lastKnownPlayerVector = knowledge.playerVector ?? lastKnownPlayerVector
      lastKnownPlayerPosition = { ...knowledge.confirmedPlayerPosition }
      lastKnownPlayerTurn = turn
    }

    if (
      archetype === "turtle" &&
      (knowledge.directDetection || knowledge.detectedByPlayerSonar ||
        chebyshevDistance(position, context.player) <=
          HOSTILE_TURTLE_VISUAL_RADIUS)
    ) {
      archetype = "hunter"
    }

    if (archetype === "turtle") {
      mode = "patrol"
      target = { ...hostileSubmarine.initialPosition }
    } else if (archetype === "scout" && lastKnownPlayerPosition) {
      mode = "retreat"
      target = chooseScoutRetreatTarget(
        hostileSubmarine,
        currentHostiles,
        context.player,
      )
    } else if (lastKnownPlayerPosition) {
      mode = "attack"
      target = predictPlayerPosition(
        map,
        lastKnownPlayerPosition,
        lastKnownPlayerVector,
        archetype,
      )
    } else if (knowledge.cluePosition) {
      mode = "investigate"
      target = { ...knowledge.cluePosition }
    } else if (archetype === "scout") {
      mode = "investigate"
      target = target && shouldKeepScoutExplorationTarget(
          map,
          context.memory,
          position,
          target,
          occupied,
        )
        ? target
        : findScoutExplorationTarget(
          map,
          context.memory,
          position,
          occupied,
          random,
        ) ?? choosePatrolStep(map, position, occupied, random)
    } else {
      mode = "investigate"
      target = choosePatrolStep(map, position, occupied, random)
    }

    if (
      archetype === "hunter" &&
      salvoShotsRemaining > 0 &&
      salvoMoveTarget &&
      !pointsEqual(position, salvoMoveTarget)
    ) {
      mode = "attack"
      target = { ...salvoMoveTarget }
    }

    plannedPath = describePlannedPath(
      map,
      hostileSubmarine,
      archetype,
      position,
      target,
      occupied,
      context.player,
    )

    const nextStep = chooseNextStep(
      map,
      hostileSubmarine,
      archetype,
      position,
      target,
      occupied,
      context.player,
    )

    if (nextStep) {
      if (nextStep.x !== position.x) {
        facing = nextStep.x < position.x ? "left" : "right"
      }

      position = nextStep

      if (pointsEqual(position, context.player)) {
        playerDestroyed = true
      }
    }

    const attack = resolveAttack(
      map,
      hostileSubmarine,
      currentHostiles,
      archetype,
      position,
      facing,
      reload,
      torpedoAmmo,
      vlsAmmo,
      depthChargeAmmo,
      lastKnownPlayerPosition,
      lastKnownPlayerTurn,
      random,
      turn,
      salvoShotsRemaining,
      salvoStepDirection,
      salvoMoveTarget,
    )
    launchedTorpedoes.push(...attack.torpedoes)
    launchedDepthCharges.push(...attack.depthCharges)
    reload = attack.reload
    torpedoAmmo = attack.torpedoAmmo
    vlsAmmo = attack.vlsAmmo
    depthChargeAmmo = attack.depthChargeAmmo
    salvoShotsRemaining = attack.salvoShotsRemaining
    salvoStepDirection = attack.salvoStepDirection
    salvoMoveTarget = attack.salvoMoveTarget

    const sonarInterval = sonarIntervalForHostile(
      archetype,
      Boolean(lastKnownPlayerPosition),
    )
    const shouldEmitSonar = knowledge.detectedByPlayerSonar ||
      knowledge.receivedImmediateRelay ||
      (sonarInterval !== null && turn - lastSonarTurn >= sonarInterval)

    if (shouldEmitSonar) {
      lastSonarTurn = turn
      const shouldBroadcastFix = knowledge.detectedByPlayerSonar ||
        (lastKnownPlayerPosition && lastKnownPlayerTurn !== null &&
          turn - lastKnownPlayerTurn <= 2 &&
          shouldBroadcastPlayerPosition(archetype, random))
      const sonarWave: Shockwave = {
        origin: { ...position },
        radius: 0,
        senderId: hostileSubmarine.id,
        damaging: false,
        revealTerrain: false,
        revealEntities: false,
        visibleToPlayer: hasLineOfSight(map, context.player, position),
        ...(lastKnownPlayerPosition && shouldBroadcastFix
          ? {
            message: {
              kind: "player-location" as const,
              position: { ...lastKnownPlayerPosition },
            },
          }
          : {}),
      }
      spawnedShockwaves.push(sonarWave)
      availableShockwaves.push(sonarWave)
    }

    occupied.add(keyOfPoint(position))
    nextHostileSubmarines.push({
      ...hostileSubmarine,
      archetype,
      position,
      facing,
      mode,
      target,
      reload,
      initialPosition: { ...hostileSubmarine.initialPosition },
      torpedoAmmo,
      vlsAmmo,
      depthChargeAmmo,
      lastSonarTurn,
      lastKnownPlayerPosition,
      lastKnownPlayerVector,
      lastKnownPlayerTurn,
      plannedPath: describePlannedPath(
        map,
        hostileSubmarine,
        archetype,
        position,
        salvoMoveTarget ?? target,
        occupied,
        context.player,
      ),
      salvoShotsRemaining,
      salvoStepDirection,
      salvoMoveTarget,
    })
  })

  return {
    hostileSubmarines: nextHostileSubmarines,
    launchedTorpedoes,
    launchedDepthCharges,
    spawnedShockwaves,
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

function chooseArchetype(random: () => number): HostileSubmarineArchetype {
  const roll = random()

  if (roll < 0.08) {
    return "turtle"
  }

  if (roll < 0.5) {
    return "scout"
  }

  return "hunter"
}

function loadoutForArchetype(archetype: HostileSubmarineArchetype): Loadout {
  switch (archetype) {
    case "scout":
      return { ...SCOUT_LOADOUT }
    case "turtle":
      return { ...TURTLE_LOADOUT }
    case "hunter":
      return { ...HUNTER_LOADOUT }
  }
}

function hydrateHostileSubmarine(
  hostileSubmarine: HostileSubmarine,
): ResolvedHostileSubmarine {
  const archetype = hostileSubmarine.archetype ?? "hunter"
  const loadout = loadoutForArchetype(archetype)

  return {
    ...hostileSubmarine,
    archetype,
    initialPosition: hostileSubmarine.initialPosition
      ? { ...hostileSubmarine.initialPosition }
      : { ...hostileSubmarine.position },
    torpedoAmmo: hostileSubmarine.torpedoAmmo ?? loadout.torpedoAmmo,
    vlsAmmo: hostileSubmarine.vlsAmmo ?? loadout.vlsAmmo,
    depthChargeAmmo: hostileSubmarine.depthChargeAmmo ??
      loadout.depthChargeAmmo,
    lastSonarTurn: hostileSubmarine.lastSonarTurn ?? 0,
    lastKnownPlayerPosition: hostileSubmarine.lastKnownPlayerPosition
      ? { ...hostileSubmarine.lastKnownPlayerPosition }
      : null,
    lastKnownPlayerVector: hostileSubmarine.lastKnownPlayerVector
      ? { ...hostileSubmarine.lastKnownPlayerVector }
      : null,
    lastKnownPlayerTurn: hostileSubmarine.lastKnownPlayerTurn ?? null,
    plannedPath: hostileSubmarine.plannedPath
      ? hostileSubmarine.plannedPath.map((point) => ({ ...point }))
      : [],
    salvoShotsRemaining: hostileSubmarine.salvoShotsRemaining ?? 0,
    salvoStepDirection: hostileSubmarine.salvoStepDirection ?? null,
    salvoMoveTarget: hostileSubmarine.salvoMoveTarget
      ? { ...hostileSubmarine.salvoMoveTarget }
      : null,
  }
}

function gatherKnowledge(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  hostileSubmarines: ResolvedHostileSubmarine[],
  context: HostileTurnContext,
): HostileKnowledge {
  const playerVector = createPlayerVector(
    context.previousPlayer,
    context.player,
  )
  const directDetection = canDirectlyDetectPlayer(
    map,
    hostileSubmarine,
    context.player,
  )

  if (directDetection) {
    return {
      confirmedPlayerPosition: { ...context.player },
      cluePosition: { ...context.player },
      playerVector,
      directDetection: true,
      detectedByPlayerSonar: false,
      receivedImmediateRelay: false,
    }
  }

  const playerSonarFix = context.playerSonarHitHostiles.has(hostileSubmarine.id)
    ? { ...context.player }
    : null

  if (playerSonarFix) {
    return {
      confirmedPlayerPosition: playerSonarFix,
      cluePosition: playerSonarFix,
      playerVector,
      directDetection: false,
      detectedByPlayerSonar: true,
      receivedImmediateRelay: false,
    }
  }

  const messagePosition = findPlayerMessage(
    hostileSubmarine,
    context.shockwaves,
  )

  if (messagePosition) {
    return {
      confirmedPlayerPosition: messagePosition,
      cluePosition: messagePosition,
      playerVector,
      directDetection: false,
      detectedByPlayerSonar: false,
      receivedImmediateRelay: false,
    }
  }

  const trailPosition = findTrailClue(
    hostileSubmarine.position,
    context.trails,
    map.width,
  )
  const pingPosition = findPingClue(
    hostileSubmarine,
    hostileSubmarines,
    context.shockwaves,
  )

  return {
    confirmedPlayerPosition: null,
    cluePosition: pingPosition ?? trailPosition,
    playerVector,
    directDetection: false,
    detectedByPlayerSonar: false,
    receivedImmediateRelay: false,
  }
}

function propagateImmediatePlayerFixes(
  hostileSubmarines: ResolvedHostileSubmarine[],
  knowledges: ReadonlyMap<string, HostileKnowledge>,
): Map<string, Point> {
  const hostileById = new Map(
    hostileSubmarines.map((
      hostileSubmarine,
    ) => [hostileSubmarine.id, hostileSubmarine]),
  )
  const relayedFixes = new Map<string, Point>()
  const queue = hostileSubmarines
    .filter((hostileSubmarine) =>
      knowledges.get(hostileSubmarine.id)?.detectedByPlayerSonar
    )
    .map((hostileSubmarine) => hostileSubmarine.id)
  const visited = new Set(queue)

  while (queue.length > 0) {
    const senderId = queue.shift()

    if (!senderId) {
      continue
    }

    const sender = hostileById.get(senderId)
    const senderKnowledge = knowledges.get(senderId)
    const senderFix = relayedFixes.get(senderId) ??
      senderKnowledge?.confirmedPlayerPosition

    if (!sender || !senderFix) {
      continue
    }

    for (const hostileSubmarine of hostileSubmarines) {
      if (
        hostileSubmarine.id === senderId ||
        chebyshevDistance(sender.position, hostileSubmarine.position) >
          HOSTILE_COMMUNICATION_RADIUS
      ) {
        continue
      }

      if (!relayedFixes.has(hostileSubmarine.id)) {
        relayedFixes.set(hostileSubmarine.id, { ...senderFix })
      }

      if (!visited.has(hostileSubmarine.id)) {
        visited.add(hostileSubmarine.id)
        queue.push(hostileSubmarine.id)
      }
    }
  }

  return relayedFixes
}

function canDirectlyDetectPlayer(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  player: Point,
): boolean {
  const radius = hostileSubmarine.archetype === "turtle"
    ? HOSTILE_TURTLE_VISUAL_RADIUS
    : HOSTILE_PLAYER_DETECTION_RADIUS

  return chebyshevDistance(hostileSubmarine.position, player) <= radius ||
    hasClearCardinalPath(map, hostileSubmarine.position, player)
}

function findPlayerMessage(
  hostileSubmarine: ResolvedHostileSubmarine,
  shockwaves: Shockwave[],
): Point | null {
  for (const shockwave of shockwaves) {
    if (
      !shockwave.message ||
      shockwave.senderId === hostileSubmarine.id ||
      chebyshevDistance(hostileSubmarine.position, shockwave.origin) >
        HOSTILE_COMMUNICATION_RADIUS
    ) {
      continue
    }

    return { ...shockwave.message.position }
  }

  return null
}

function findTrailClue(
  position: Point,
  trails: FadeCell[],
  width: number,
): Point | null {
  let bestPoint: Point | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const trail of trails) {
    if (trail.alpha < 0.16) {
      continue
    }

    const point = {
      x: trail.index % width,
      y: Math.floor(trail.index / width),
    }
    const distance = chebyshevDistance(position, point)

    if (distance > HOSTILE_PLAYER_CLUE_RADIUS || distance >= bestDistance) {
      continue
    }

    bestPoint = point
    bestDistance = distance
  }

  return bestPoint
}

function findPingClue(
  hostileSubmarine: ResolvedHostileSubmarine,
  hostileSubmarines: ResolvedHostileSubmarine[],
  shockwaves: Shockwave[],
): Point | null {
  let bestPoint: Point | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  const initialPositions = hostileSubmarines
    .filter((candidate) => candidate.id !== hostileSubmarine.id)
    .map((candidate) => candidate.initialPosition)

  for (const shockwave of shockwaves) {
    if (
      shockwave.senderId === hostileSubmarine.id ||
      chebyshevDistance(hostileSubmarine.position, shockwave.origin) >
        HOSTILE_SHOCKWAVE_DETECTION_RADIUS
    ) {
      continue
    }

    const senderLooksFriendly = initialPositions.some((point) =>
      chebyshevDistance(point, shockwave.origin) <= 2
    )
    const senderLooksRelevant = shockwave.senderId === "player" ||
      shockwave.damaging ||
      senderLooksFriendly

    if (!senderLooksRelevant) {
      continue
    }

    const distance = chebyshevDistance(
      hostileSubmarine.position,
      shockwave.origin,
    )

    if (distance >= bestDistance) {
      continue
    }

    bestPoint = { ...shockwave.origin }
    bestDistance = distance
  }

  return bestPoint
}

function createPlayerVector(
  previousPlayer: Point,
  player: Point,
): Point | null {
  const vector = {
    x: player.x - previousPlayer.x,
    y: player.y - previousPlayer.y,
  }

  return vector.x === 0 && vector.y === 0 ? null : vector
}

function chooseScoutRetreatTarget(
  hostileSubmarine: ResolvedHostileSubmarine,
  hostileSubmarines: ResolvedHostileSubmarine[],
  player: Point,
): Point {
  const candidates = hostileSubmarines
    .filter((candidate) => candidate.id !== hostileSubmarine.id)
    .map((candidate) => candidate.initialPosition)

  if (candidates.length === 0) {
    return { ...hostileSubmarine.initialPosition }
  }

  return candidates.reduce((best, candidate) => {
    const bestScore = chebyshevDistance(best, player)
    const candidateScore = chebyshevDistance(candidate, player)
    return candidateScore > bestScore ? candidate : best
  }, candidates[0])
}

function predictPlayerPosition(
  map: GeneratedMap,
  lastKnownPlayerPosition: Point,
  lastKnownPlayerVector: Point | null,
  archetype: HostileSubmarineArchetype,
): Point {
  if (!lastKnownPlayerVector) {
    return { ...lastKnownPlayerPosition }
  }

  const projectionDistance = archetype === "hunter" ? 2 : 1
  const candidate = {
    x: lastKnownPlayerPosition.x + lastKnownPlayerVector.x * projectionDistance,
    y: lastKnownPlayerPosition.y + lastKnownPlayerVector.y * projectionDistance,
  }

  return isPassableTile(tileAt(map, candidate.x, candidate.y))
    ? candidate
    : { ...lastKnownPlayerPosition }
}

function chooseNextStep(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  archetype: HostileSubmarineArchetype,
  position: Point,
  target: Point | null,
  occupied: Set<string>,
  player: Point,
): Point | null {
  if (archetype === "turtle") {
    return null
  }

  if (
    target && target.y === position.y &&
    hasClearCardinalPath(map, position, target) &&
    archetype !== "scout"
  ) {
    return null
  }

  if (archetype === "scout" && hostileSubmarine.lastKnownPlayerPosition) {
    return chooseRetreatStep(
      map,
      position,
      target ?? hostileSubmarine.initialPosition,
      occupied,
      player,
    )
  }

  if (!target) {
    return null
  }

  return findNextStepToward(map, position, target, occupied)
}

function describePlannedPath(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  archetype: HostileSubmarineArchetype,
  position: Point,
  target: Point | null,
  occupied: Set<string>,
  player: Point,
): Point[] {
  if (archetype === "turtle") {
    return [{ ...position }]
  }

  if (
    target && target.y === position.y &&
    hasClearCardinalPath(map, position, target) &&
    archetype !== "scout"
  ) {
    return [{ ...position }]
  }

  if (!target) {
    return [{ ...position }]
  }

  if (archetype === "scout" && hostileSubmarine.lastKnownPlayerPosition) {
    const retreatStep = chooseRetreatStep(
      map,
      position,
      target,
      occupied,
      player,
    )
    return retreatStep ? [{ ...position }, retreatStep] : [{ ...position }]
  }

  return findPathToward(map, position, target, occupied)
}

function chooseRetreatStep(
  map: GeneratedMap,
  position: Point,
  retreatTarget: Point,
  occupied: Set<string>,
  player: Point,
): Point | null {
  const options = orderedNeighbors(position, retreatTarget)
    .filter((point) =>
      isPassableTile(tileAt(map, point.x, point.y)) &&
      !occupied.has(keyOfPoint(point))
    )

  if (options.length === 0) {
    return null
  }

  return options.sort((left, right) => {
    const leftScore = chebyshevDistance(left, player) * 10 -
      chebyshevDistance(left, retreatTarget)
    const rightScore = chebyshevDistance(right, player) * 10 -
      chebyshevDistance(right, retreatTarget)
    return rightScore - leftScore
  })[0]
}

function resolveAttack(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  hostileSubmarines: ResolvedHostileSubmarine[],
  archetype: HostileSubmarineArchetype,
  position: Point,
  facing: HostileSubmarine["facing"],
  reload: number,
  torpedoAmmo: number,
  vlsAmmo: number,
  depthChargeAmmo: number,
  lastKnownPlayerPosition: Point | null,
  lastKnownPlayerTurn: number | null,
  random: () => number,
  turn: number,
  salvoShotsRemaining: number,
  salvoStepDirection: "up" | "down" | null,
  salvoMoveTarget: Point | null,
): AttackResolution {
  const noAttack = (nextReload = reload): AttackResolution => ({
    torpedoes: [],
    depthCharges: [],
    reload: nextReload,
    torpedoAmmo,
    vlsAmmo,
    depthChargeAmmo,
    salvoShotsRemaining,
    salvoStepDirection,
    salvoMoveTarget,
  })

  if (!lastKnownPlayerPosition || reload > 0) {
    return noAttack()
  }

  if (
    archetype === "hunter" &&
    salvoShotsRemaining > 0 &&
    salvoMoveTarget &&
    !pointsEqual(position, salvoMoveTarget)
  ) {
    return noAttack()
  }

  const guessRadius = archetype === "hunter" ? 2 : 1
  const directLane = hasClearCardinalPath(
    map,
    position,
    lastKnownPlayerPosition,
  )
  const guessedTarget = {
    x: lastKnownPlayerPosition.x +
      randomInteger(random, -guessRadius, guessRadius),
    y: lastKnownPlayerPosition.y +
      randomInteger(random, -guessRadius, guessRadius),
  }

  if (directLane) {
    guessedTarget.y = position.y
  }

  const turnAge = lastKnownPlayerTurn === null
    ? Number.POSITIVE_INFINITY
    : turn - lastKnownPlayerTurn
  const maxEvidenceAge = archetype === "hunter" ? 2 : 1
  const confidence = archetype === "hunter"
    ? turnAge === 0 ? 0.32 : 0.16
    : turnAge === 0
    ? 0.62
    : 0.28

  if (turnAge > maxEvidenceAge) {
    return noAttack()
  }

  if (!directLane && random() > confidence) {
    return noAttack()
  }

  const avoidFriendlyFire = archetype === "scout"

  if (
    avoidFriendlyFire &&
    !isAttackLaneSafe(guessedTarget, hostileSubmarine, hostileSubmarines)
  ) {
    return noAttack()
  }

  const torpedoes: Torpedo[] = []
  const depthCharges: DepthCharge[] = []
  let nextReload = HOSTILE_TORPEDO_COOLDOWN
  let nextTorpedoAmmo = torpedoAmmo
  let nextVlsAmmo = vlsAmmo
  let nextDepthChargeAmmo = depthChargeAmmo
  let nextSalvoShotsRemaining = salvoShotsRemaining
  let nextSalvoStepDirection = salvoStepDirection
  let nextSalvoMoveTarget = salvoMoveTarget ? { ...salvoMoveTarget } : null

  if (guessedTarget.x !== position.x && nextTorpedoAmmo > 0) {
    const direction: Direction = guessedTarget.x < position.x ? "left" : "right"
    torpedoes.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      direction,
      speed: TORPEDO_SPEED,
      rangeRemaining: HOSTILE_TORPEDO_RANGE,
      avoidFriendlyFire,
    })
    nextTorpedoAmmo -= 1
  } else if (guessedTarget.y < position.y && nextVlsAmmo > 0) {
    torpedoes.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      direction: "up",
      speed: TORPEDO_SPEED,
      rangeRemaining: HOSTILE_TORPEDO_RANGE,
      avoidFriendlyFire,
    })
    nextVlsAmmo -= 1
  } else if (nextDepthChargeAmmo > 0) {
    depthCharges.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      speed: DEPTH_CHARGE_SPEED,
      rangeRemaining: DEPTH_CHARGE_RANGE,
      avoidFriendlyFire,
    })
    nextDepthChargeAmmo -= 1
  }

  if (torpedoes.length === 0 && depthCharges.length === 0) {
    return noAttack(Math.max(0, reload))
  }

  if (archetype === "hunter") {
    const continuingSalvo = salvoShotsRemaining > 0
    const startingSalvo = !continuingSalvo && !directLane && random() < 0.45

    if (continuingSalvo || startingSalvo) {
      nextSalvoShotsRemaining = continuingSalvo ? salvoShotsRemaining - 1 : 2
      nextSalvoStepDirection = continuingSalvo
        ? salvoStepDirection
        : chooseSalvoStepDirection(map, position, random)
      nextSalvoMoveTarget =
        nextSalvoShotsRemaining > 0 && nextSalvoStepDirection
          ? createNextSalvoMoveTarget(map, position, nextSalvoStepDirection)
          : null

      if (!nextSalvoMoveTarget) {
        nextSalvoShotsRemaining = 0
        nextSalvoStepDirection = null
      }
    } else {
      nextSalvoShotsRemaining = 0
      nextSalvoStepDirection = null
      nextSalvoMoveTarget = null
    }
  } else {
    nextSalvoShotsRemaining = 0
    nextSalvoStepDirection = null
    nextSalvoMoveTarget = null
  }

  if (
    archetype === "scout" &&
    chebyshevDistance(position, guessedTarget) < SONAR_ENTITY_IDENTIFY_RADIUS
  ) {
    nextReload += 1
  }

  return {
    torpedoes,
    depthCharges,
    reload: nextReload,
    torpedoAmmo: nextTorpedoAmmo,
    vlsAmmo: nextVlsAmmo,
    depthChargeAmmo: nextDepthChargeAmmo,
    salvoShotsRemaining: nextSalvoShotsRemaining,
    salvoStepDirection: nextSalvoStepDirection,
    salvoMoveTarget: nextSalvoMoveTarget,
  }
}

function chooseSalvoStepDirection(
  map: GeneratedMap,
  position: Point,
  random: () => number,
): "up" | "down" | null {
  const directions = random() < 0.5
    ? ["up", "down"] as const
    : ["down", "up"] as const

  for (const direction of directions) {
    if (createNextSalvoMoveTarget(map, position, direction)) {
      return direction
    }
  }

  return null
}

function createNextSalvoMoveTarget(
  map: GeneratedMap,
  position: Point,
  direction: "up" | "down",
): Point | null {
  const delta = direction === "up" ? -1 : 1
  const target = { x: position.x, y: position.y + delta * 2 }

  if (
    isPassableTile(tileAt(map, target.x, target.y)) &&
    isPassableTile(tileAt(map, position.x, position.y + delta))
  ) {
    return target
  }

  return null
}

function isAttackLaneSafe(
  guessedTarget: Point,
  hostileSubmarine: ResolvedHostileSubmarine,
  hostileSubmarines: ResolvedHostileSubmarine[],
): boolean {
  return hostileSubmarines.every((candidate) =>
    candidate.id === hostileSubmarine.id ||
    chebyshevDistance(candidate.initialPosition, guessedTarget) > 3
  )
}

function sonarIntervalForHostile(
  archetype: HostileSubmarineArchetype,
  hasPlayerFix: boolean,
): number | null {
  switch (archetype) {
    case "turtle":
      return null
    case "scout":
      return hasPlayerFix
        ? HOSTILE_SCOUT_ALERT_SONAR_INTERVAL
        : HOSTILE_SCOUT_SONAR_INTERVAL
    case "hunter":
      return HOSTILE_HUNTER_SONAR_INTERVAL
  }
}

function shouldBroadcastPlayerPosition(
  archetype: HostileSubmarineArchetype,
  random: () => number,
): boolean {
  if (archetype === "scout") {
    return true
  }

  return random() >= 0.35
}

function hasClearCardinalPath(
  map: GeneratedMap,
  from: Point,
  to: Point,
): boolean {
  if (from.x !== to.x && from.y !== to.y) {
    return false
  }

  const step = deltaForDirection(
    from.x < to.x
      ? "right"
      : from.x > to.x
      ? "left"
      : from.y < to.y
      ? "down"
      : "up",
  )
  let current = { x: from.x + step.x, y: from.y + step.y }

  while (!pointsEqual(current, to)) {
    if (tileAt(map, current.x, current.y) !== "water") {
      return false
    }

    current = { x: current.x + step.x, y: current.y + step.y }
  }

  return true
}

function hasLineOfSight(map: GeneratedMap, from: Point, to: Point): boolean {
  const fov = new FOV.PreciseShadowcasting((x, y) =>
    tileAt(map, x, y) === "water"
  )
  let visible = false

  fov.compute(from.x, from.y, Math.max(map.width, map.height), (x, y) => {
    if (x === to.x && y === to.y) {
      visible = true
    }
  })

  return visible
}

function choosePatrolStep(
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
  ).filter((point) =>
    isPassableTile(tileAt(map, point.x, point.y)) &&
    !occupied.has(keyOfPoint(point))
  )

  return options.length > 0 ? options[0] : null
}

function findScoutExplorationTarget(
  map: GeneratedMap,
  memory: Array<"wall" | "water" | null>,
  start: Point,
  occupied: Set<string>,
  random: () => number,
): Point | null {
  const queue: Point[] = [{ ...start }]
  const parents = new Map<string, Point | null>()
  parents.set(keyOfPoint(start), null)
  const candidates: Array<{ point: Point; score: number }> = []
  let fallback: Point | null = null
  let fallbackDistance = -1

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    const currentIndex = indexForPoint(map.width, current)
    const distance = distanceScore(current, start)

    if (!pointsEqual(current, start)) {
      if (distance > fallbackDistance) {
        fallback = current
        fallbackDistance = distance
      }

      const unseenNeighbors = countScoutUnseenNeighbors(map, memory, current)
      const unexploredTile = memory[currentIndex] === null ? 1 : 0

      if (unexploredTile > 0 || unseenNeighbors > 0) {
        candidates.push({
          point: current,
          score: distance * 10 + unseenNeighbors * 25 + unexploredTile * 40,
        })
      }
    }

    for (
      const next of shufflePoints(
        CARDINAL_STEPS.map((step) => ({
          x: current.x + step.x,
          y: current.y + step.y,
        })),
        random,
      )
    ) {
      const key = keyOfPoint(next)

      if (
        parents.has(key) ||
        !isPassableTile(tileAt(map, next.x, next.y)) ||
        occupied.has(key)
      ) {
        continue
      }

      parents.set(key, current)
      queue.push(next)
    }
  }

  if (candidates.length > 0) {
    candidates.sort((left, right) => right.score - left.score)
    return candidates[0].point
  }

  return fallback
}

function shouldKeepScoutExplorationTarget(
  map: GeneratedMap,
  memory: Array<"wall" | "water" | null>,
  start: Point,
  target: Point,
  occupied: Set<string>,
): boolean {
  if (
    pointsEqual(start, target) ||
    !isPassableTile(tileAt(map, target.x, target.y))
  ) {
    return false
  }

  const targetKey = keyOfPoint(target)

  if (occupied.has(targetKey)) {
    return false
  }

  const targetIndex = indexForPoint(map.width, target)

  if (
    memory[targetIndex] === null ||
    countScoutUnseenNeighbors(map, memory, target) > 0
  ) {
    return findPathToward(map, start, target, occupied).length > 1
  }

  return false
}

function countScoutUnseenNeighbors(
  map: GeneratedMap,
  memory: Array<"wall" | "water" | null>,
  point: Point,
): number {
  return CARDINAL_STEPS.reduce((count, step) => {
    const neighbor = { x: point.x + step.x, y: point.y + step.y }

    if (tileAt(map, neighbor.x, neighbor.y) === undefined) {
      return count
    }

    return memory[indexForPoint(map.width, neighbor)] === null
      ? count + 1
      : count
  }, 0)
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
