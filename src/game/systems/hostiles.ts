import {
  DEPTH_CHARGE_RANGE,
  DEPTH_CHARGE_SPEED,
  HOSTILE_COMMUNICATION_RADIUS,
  HOSTILE_GUARD_MAX_CAPSULE_DISTANCE,
  HOSTILE_GUARD_MIN_CAPSULE_DISTANCE,
  HOSTILE_GUARD_MIN_COUNT,
  HOSTILE_GUARD_SONAR_INTERVAL,
  HOSTILE_HUNTER_SONAR_INTERVAL,
  HOSTILE_HUNTER_MIN_COUNT,
  HOSTILE_MIN_CAPSULE_DISTANCE,
  HOSTILE_MIN_SPAWN_DISTANCE,
  HOSTILE_PLAYER_CLUE_RADIUS,
  HOSTILE_PLAYER_DETECTION_RADIUS,
  HOSTILE_SALVO_OFFSET,
  HOSTILE_SCOUT_ALERT_SONAR_INTERVAL,
  HOSTILE_SCOUT_MIN_COUNT,
  HOSTILE_SCOUT_SPAWN_SEPARATION,
  HOSTILE_SCOUT_SONAR_INTERVAL,
  HOSTILE_SHOCKWAVE_DETECTION_RADIUS,
  HOSTILE_SPAWN_SEPARATION,
  HOSTILE_TORPEDO_COOLDOWN,
  HOSTILE_TORPEDO_RANGE,
  HOSTILE_TURTLE_VISUAL_RADIUS,
  PROJECTILE_PROXIMITY_RADIUS,
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
  HostileAiDebugState,
  HostileAttackDebugState,
  HostileSubmarine,
  HostileSubmarineArchetype,
  HostileSubmarineMode,
  Shockwave,
  Torpedo,
} from "../model.ts"
import {
  type GeneratedMap,
  isPassableTile,
  type TileKind,
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
  memory: Array<TileKind | null>
  playerSonarHitHostiles: ReadonlySet<string>
  capsuleRetrievedThisTurn: boolean
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
  previousPosition: Point | null
  plannedPath: Point[]
  lastAiLog: string | null
  salvoShotsRemaining: number
  salvoStepDirection: Direction | null
  salvoMoveTarget: Point | null
}

interface HostileKnowledge {
  confirmedPlayerPosition: Point | null
  cluePosition: Point | null
  playerVector: Point | null
  directDetection: boolean
  detectedByPlayerSonar: boolean
  receivedImmediateRelay: boolean
  alertedByCapsuleRecovery: boolean
}

interface AttackResolution {
  torpedoes: Torpedo[]
  depthCharges: DepthCharge[]
  reload: number
  torpedoAmmo: number
  vlsAmmo: number
  depthChargeAmmo: number
  salvoShotsRemaining: number
  salvoStepDirection: Direction | null
  salvoMoveTarget: Point | null
  debugState: HostileAttackDebugState
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

const GUARD_LOADOUT: Loadout = {
  torpedoAmmo: 4,
  vlsAmmo: 4,
  depthChargeAmmo: 4,
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
  const requiredGuardCount = count >= HOSTILE_SCOUT_MIN_COUNT + HOSTILE_GUARD_MIN_COUNT
    ? HOSTILE_GUARD_MIN_COUNT
    : 0
  const requiredScoutCount = count >=
      HOSTILE_SCOUT_MIN_COUNT + requiredGuardCount + HOSTILE_HUNTER_MIN_COUNT
    ? HOSTILE_SCOUT_MIN_COUNT
    : Math.max(0, count - requiredGuardCount - HOSTILE_HUNTER_MIN_COUNT)
  const requiredHunterCount = Math.min(
    HOSTILE_HUNTER_MIN_COUNT,
    Math.max(0, count - requiredGuardCount - requiredScoutCount),
  )

  for (const point of candidates) {
    const currentGuardCount = hostileSubmarines.filter((candidate) =>
      candidate.archetype === "guard"
    ).length
    const currentScoutCount = hostileSubmarines.filter((candidate) =>
      candidate.archetype === "scout"
    ).length
    const currentHunterCount = hostileSubmarines.filter((candidate) =>
      candidate.archetype === "hunter"
    ).length
    const provisionalArchetype = chooseArchetype(random)
    const archetype = currentGuardCount < requiredGuardCount
      ? "guard"
      : currentScoutCount < requiredScoutCount
        ? "scout"
        : currentHunterCount < requiredHunterCount
          ? "hunter"
          : provisionalArchetype

    if (!canSpawnHostileAt(map, point, archetype, hostileSubmarines)) {
      continue
    }

    const loadout = loadoutForArchetype(archetype)
    hostileSubmarines.push({
      id: `hostile-${hostileSubmarines.length + 1}`,
      position: point,
      previousPosition: null,
      initialPosition: { ...point },
      facing: random() >= 0.5 ? "right" : "left",
      mode: archetype === "turtle" || archetype === "guard"
        ? "patrol"
        : "investigate",
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
  aiDecisionLogs: string[]
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
  const aiDecisionLogs: string[] = []
  const reservedInvestigationTargets = new Set(
    currentHostiles.flatMap((hostileSubmarine) => [
      ...(hostileSubmarine.target ? [keyOfPoint(hostileSubmarine.target)] : []),
      ...hostileSubmarine.plannedPath.slice(1).map((point) => keyOfPoint(point)),
    ]),
  )
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
  const enemiesKnowFullMap = context.memory.every((tile) => tile !== null)
  let playerDestroyed = false

  currentHostiles.forEach((hostileSubmarine, index) => {
    occupied.delete(keyOfPoint(hostileSubmarine.position))

    const random = createDeterministicRandom(
      `${seed}:hostile:${hostileSubmarine.id}`,
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
    let previousPosition = hostileSubmarine.previousPosition
      ? { ...hostileSubmarine.previousPosition }
      : null
    let torpedoAmmo = hostileSubmarine.torpedoAmmo
    let vlsAmmo = hostileSubmarine.vlsAmmo
    let depthChargeAmmo = hostileSubmarine.depthChargeAmmo
    let plannedPath = hostileSubmarine.plannedPath.map((point) => ({
      ...point,
    }))
    let retainedPlannedPath: Point[] | null = null
    let lastAiLog = hostileSubmarine.lastAiLog
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

    if (!lastKnownPlayerPosition) {
      salvoShotsRemaining = 0
      salvoStepDirection = null
      salvoMoveTarget = null
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
    } else if (
      archetype === "guard" &&
      knowledge.cluePosition &&
      chebyshevDistance(knowledge.cluePosition, map.capsule) <=
        HOSTILE_GUARD_MAX_CAPSULE_DISTANCE + PROJECTILE_PROXIMITY_RADIUS
    ) {
      mode = "investigate"
      retainedPlannedPath = target
        ? keepInvestigationPath(
          map,
          position,
          target,
          knowledge.cluePosition,
          occupied,
          plannedPath,
        )
        : null
      target = retainedPlannedPath
        ? target
        : chooseCoordinatedClueTarget(
          map,
          position,
          knowledge.cluePosition,
          occupied,
          reservedInvestigationTargets,
          random,
        )
    } else if (knowledge.cluePosition) {
      mode = "investigate"
      retainedPlannedPath = target
        ? keepInvestigationPath(
          map,
          position,
          target,
          knowledge.cluePosition,
          occupied,
          plannedPath,
        )
        : null
      target = retainedPlannedPath
        ? target
        : chooseCoordinatedClueTarget(
          map,
          position,
          knowledge.cluePosition,
          occupied,
          reservedInvestigationTargets,
          random,
        )
    } else if (archetype === "scout") {
      mode = "investigate"
      retainedPlannedPath = target
        ? keepPatrolPath(map, position, target, occupied, plannedPath)
        : null
      target = retainedPlannedPath
        ? target
        : (enemiesKnowFullMap
          ? chooseCoordinatedSearchTarget(
            map,
            position,
            occupied,
            reservedInvestigationTargets,
            random,
            previousPosition,
          )
          : findScoutExplorationTarget(
            map,
            context.memory,
            position,
            occupied,
            random,
          )) ?? choosePatrolStep(map, position, occupied, random, previousPosition)
    } else if (archetype === "guard") {
      mode = "patrol"
      retainedPlannedPath = target
        ? keepPatrolPath(map, position, target, occupied, plannedPath)
        : null
      target = retainedPlannedPath
        ? target
        : chooseGuardPatrolTarget(
          map,
          map.capsule,
          hostileSubmarine.initialPosition,
          position,
          occupied,
          random,
          previousPosition,
        )
    } else {
      mode = "investigate"
      retainedPlannedPath = target
        ? keepPatrolPath(map, position, target, occupied, plannedPath)
        : null
      target = retainedPlannedPath
        ? target
        : chooseCoordinatedSearchTarget(
          map,
          position,
          occupied,
          reservedInvestigationTargets,
          random,
          previousPosition,
        ) ?? choosePatrolStep(map, position, occupied, random, previousPosition)
    }

    if (mode === "investigate" && target) {
      reservedInvestigationTargets.add(keyOfPoint(target))
    }

    const movementTarget = salvoMoveTarget && !pointsEqual(position, salvoMoveTarget)
      ? salvoMoveTarget
      : target
    const repositioningForSalvo = Boolean(
      salvoMoveTarget && !pointsEqual(position, salvoMoveTarget),
    )

    const nextAiLog = describeHostileAiDecision(hostileSubmarine.id, mode, target)

    if (
      nextAiLog !== null &&
      !matchesDecision(hostileSubmarine.mode, hostileSubmarine.target, mode, target)
    ) {
      aiDecisionLogs.push(nextAiLog)
    }

    lastAiLog = nextAiLog ?? lastAiLog

    plannedPath = canUsePlannedPathForMovement(
      map,
      hostileSubmarine,
      archetype,
      position,
      target,
      movementTarget,
      occupied,
      context.player,
      reload,
      knowledge.directDetection,
      repositioningForSalvo,
      retainedPlannedPath,
    )
      ? retainedPlannedPath.map((point) => ({ ...point }))
      : canReuseCurrentPlannedPath(
        map,
        hostileSubmarine,
        archetype,
        position,
        movementTarget,
        occupied,
        context.player,
        reload,
        knowledge.directDetection,
        repositioningForSalvo,
      )
      ? hostileSubmarine.plannedPath.map((point) => ({ ...point }))
      : describePlannedPath(
        map,
        hostileSubmarine,
        archetype,
        position,
        movementTarget,
        occupied,
        context.player,
        reload,
        knowledge.directDetection,
        repositioningForSalvo,
      )

    const nextStep = plannedPath[1] ?? null

    if (nextStep) {
      previousPosition = { ...position }

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
      knowledge.directDetection,
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
    const finalMovementTarget = salvoMoveTarget ?? target
    const storedPlannedPath = canAdvancePlannedPath(
      plannedPath,
      movementTarget,
      finalMovementTarget,
    )
      ? advancePlannedPath(plannedPath)
      : describePlannedPath(
        map,
        hostileSubmarine,
        archetype,
        position,
        finalMovementTarget,
        occupied,
        context.player,
        reload,
        knowledge.directDetection,
        false,
      )

    const sonarInterval = sonarIntervalForHostile(
      archetype,
      Boolean(lastKnownPlayerPosition),
    )
    const shouldEmitSonar = knowledge.detectedByPlayerSonar ||
      knowledge.receivedImmediateRelay ||
      knowledge.alertedByCapsuleRecovery ||
      (sonarInterval !== null && turn - lastSonarTurn >= sonarInterval)
    let shouldBroadcastFix = false

    if (shouldEmitSonar) {
      lastSonarTurn = turn
      shouldBroadcastFix = Boolean(
        lastKnownPlayerPosition && lastKnownPlayerTurn !== null &&
          turn - lastKnownPlayerTurn <= 2,
      ) || knowledge.detectedByPlayerSonar || knowledge.alertedByCapsuleRecovery
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
    const debugState: HostileAiDebugState = {
      confirmedPlayerPosition: knowledge.confirmedPlayerPosition
        ? { ...knowledge.confirmedPlayerPosition }
        : null,
      cluePosition: knowledge.cluePosition ? { ...knowledge.cluePosition } : null,
      playerVector: knowledge.playerVector ? { ...knowledge.playerVector } : null,
      directDetection: knowledge.directDetection,
      detectedByPlayerSonar: knowledge.detectedByPlayerSonar,
      receivedImmediateRelay: knowledge.receivedImmediateRelay,
      alertedByCapsuleRecovery: knowledge.alertedByCapsuleRecovery,
      retainedPlannedPath: retainedPlannedPath !== null,
      repositioningForSalvo,
      movementTarget: movementTarget ? { ...movementTarget } : null,
      sonarInterval,
      emittedSonar: shouldEmitSonar,
      broadcastPlayerFix: shouldBroadcastFix,
      attack: attack.debugState,
    }
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
      previousPosition,
      lastAiLog,
      plannedPath: storedPlannedPath,
      salvoShotsRemaining,
      salvoStepDirection,
      salvoMoveTarget,
      debugState,
    })
  })

  return {
    hostileSubmarines: nextHostileSubmarines,
    launchedTorpedoes,
    launchedDepthCharges,
    spawnedShockwaves,
    aiDecisionLogs,
    playerDestroyed,
  }
}

function describeHostileAiDecision(
  id: string,
  mode: HostileSubmarineMode,
  target: Point | null,
): string {
  const suffix = target ? ` ${formatPoint(target)}` : ""

  return `${id}: will ${mode}${suffix}`
}

function matchesDecision(
  previousMode: HostileSubmarineMode,
  previousTarget: Point | null,
  nextMode: HostileSubmarineMode,
  nextTarget: Point | null,
): boolean {
  return previousMode === nextMode && pointsMatch(previousTarget, nextTarget)
}

function pointsMatch(left: Point | null, right: Point | null): boolean {
  if (left === null || right === null) {
    return left === right
  }

  return pointsEqual(left, right)
}

function formatPoint(point: Point): string {
  return `${point.x},${point.y}`
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

function canSpawnHostileAt(
  map: GeneratedMap,
  point: Point,
  archetype: HostileSubmarineArchetype,
  hostileSubmarines: HostileSubmarine[],
): boolean {
  if (chebyshevDistance(point, map.spawn) < HOSTILE_MIN_SPAWN_DISTANCE) {
    return false
  }

  const capsuleDistance = chebyshevDistance(point, map.capsule)

  if (archetype === "guard") {
    if (
      capsuleDistance < HOSTILE_GUARD_MIN_CAPSULE_DISTANCE ||
      capsuleDistance > HOSTILE_GUARD_MAX_CAPSULE_DISTANCE
    ) {
      return false
    }
  } else if (capsuleDistance < HOSTILE_MIN_CAPSULE_DISTANCE) {
    return false
  }

  return hostileSubmarines.every((hostileSubmarine) =>
    chebyshevDistance(point, hostileSubmarine.position) >=
      ((archetype === "scout" && hostileSubmarine.archetype === "scout")
        ? HOSTILE_SCOUT_SPAWN_SEPARATION
        : HOSTILE_SPAWN_SEPARATION)
  )
}

function chooseArchetype(random: () => number): HostileSubmarineArchetype {
  const roll = random()

  if (roll < 0.12) {
    return "turtle"
  }

  if (roll < 0.3) {
    return "scout"
  }

  return "hunter"
}

function loadoutForArchetype(archetype: HostileSubmarineArchetype): Loadout {
  switch (archetype) {
    case "scout":
      return { ...SCOUT_LOADOUT }
    case "guard":
      return { ...GUARD_LOADOUT }
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
    previousPosition: hostileSubmarine.previousPosition
      ? { ...hostileSubmarine.previousPosition }
      : null,
    lastAiLog: hostileSubmarine.lastAiLog ?? null,
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
      alertedByCapsuleRecovery: false,
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
      alertedByCapsuleRecovery: false,
    }
  }

  if (context.capsuleRetrievedThisTurn) {
    return {
      confirmedPlayerPosition: { ...context.player },
      cluePosition: { ...context.player },
      playerVector,
      directDetection: false,
      detectedByPlayerSonar: false,
      receivedImmediateRelay: false,
      alertedByCapsuleRecovery: true,
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
      alertedByCapsuleRecovery: false,
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
    alertedByCapsuleRecovery: false,
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
      Boolean(knowledges.get(hostileSubmarine.id)?.confirmedPlayerPosition)
    )
    .map((hostileSubmarine) => hostileSubmarine.id)
  const visited = new Set(queue)
  let queueIndex = 0

  while (queueIndex < queue.length) {
    const senderId = queue[queueIndex]
    queueIndex += 1

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

function createHorizontalShotTarget(position: Point, target: Point): Point {
  return { x: target.x, y: position.y }
}

function createVerticalShotTarget(position: Point, target: Point): Point {
  return { x: position.x, y: target.y }
}

function hasHorizontalShotOpportunity(
  map: GeneratedMap,
  position: Point,
  target: Point,
): boolean {
  return target.x !== position.x &&
    Math.abs(target.y - position.y) <= PROJECTILE_PROXIMITY_RADIUS &&
    hasClearCardinalPath(map, position, createHorizontalShotTarget(position, target))
}

function hasVerticalShotOpportunity(
  map: GeneratedMap,
  position: Point,
  target: Point,
): boolean {
  return target.y < position.y &&
    Math.abs(target.x - position.x) <= PROJECTILE_PROXIMITY_RADIUS &&
    hasClearCardinalPath(map, position, createVerticalShotTarget(position, target))
}

function findCeilingTrapShot(
  map: GeneratedMap,
  position: Point,
  target: Point,
): { direction: Direction; impactPoint: Point } | null {
  for (let y = target.y - 1; y > 0; y -= 1) {
    const ceilingPoint = { x: target.x, y }
    const tile = tileAt(map, ceilingPoint.x, ceilingPoint.y)

    if (tile !== "water") {
      if (tile !== "wall") {
        return null
      }

      if (
        ceilingPoint.y === position.y &&
        ceilingPoint.x !== position.x &&
        hasClearCardinalPath(map, position, ceilingPoint)
      ) {
        return {
          direction: ceilingPoint.x < position.x ? "left" : "right",
          impactPoint: ceilingPoint,
        }
      }

      if (
        ceilingPoint.x === position.x &&
        ceilingPoint.y < position.y &&
        hasClearCardinalPath(map, position, ceilingPoint)
      ) {
        return {
          direction: "up",
          impactPoint: ceilingPoint,
        }
      }

      return null
    }
  }

  return null
}

function chooseNextStep(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  archetype: HostileSubmarineArchetype,
  position: Point,
  target: Point | null,
  occupied: Set<string>,
  player: Point,
  reload: number,
  directDetection: boolean,
  repositioningForSalvo: boolean,
): Point | null {
  if (archetype === "turtle") {
    return null
  }

  if (!repositioningForSalvo && shouldHoldAttackPosition(
    map,
    hostileSubmarine,
    archetype,
    position,
    target,
    reload,
    directDetection,
  )) {
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
  reload: number,
  directDetection: boolean,
  repositioningForSalvo: boolean,
): Point[] {
  if (archetype === "turtle") {
    return [{ ...position }]
  }

  if (!repositioningForSalvo && shouldHoldAttackPosition(
    map,
    hostileSubmarine,
    archetype,
    position,
    target,
    reload,
    directDetection,
  )) {
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

function shouldHoldAttackPosition(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  archetype: HostileSubmarineArchetype,
  position: Point,
  target: Point | null,
  reload: number,
  directDetection: boolean,
): boolean {
  if (
    !target ||
    archetype === "scout" ||
    !hasRangedAmmo(hostileSubmarine)
  ) {
    return false
  }

  const attackReady = (archetype !== "hunter" && archetype !== "guard") ||
    (directDetection && reload === 0 &&
      chebyshevDistance(position, target) <= HOSTILE_PLAYER_DETECTION_RADIUS)

  if (!attackReady) {
    return false
  }

  return hasHorizontalShotOpportunity(map, position, target) ||
    hasVerticalShotOpportunity(map, position, target) ||
    findCeilingTrapShot(map, position, target) !== null
}

function hasRangedAmmo(hostileSubmarine: ResolvedHostileSubmarine): boolean {
  return hostileSubmarine.torpedoAmmo > 0 || hostileSubmarine.vlsAmmo > 0 ||
    hostileSubmarine.depthChargeAmmo > 0
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
  directDetection: boolean,
  random: () => number,
  turn: number,
  salvoShotsRemaining: number,
  salvoStepDirection: Direction | null,
  salvoMoveTarget: Point | null,
): AttackResolution {
  const createDebugState = (
    overrides: Partial<HostileAttackDebugState>,
  ): HostileAttackDebugState => ({
    attackTarget: null,
    guessedTarget: null,
    blockedReason: null,
    directLane: false,
    horizontalShotOpportunity: false,
    verticalShotOpportunity: false,
    ceilingTrapDirection: null,
    turnAge: null,
    maxEvidenceAge: null,
    confidence: null,
    avoidFriendlyFire: archetype === "scout",
    firedWeapon: null,
    firedDirection: null,
    salvoShotsRemaining,
    salvoStepDirection,
    salvoMoveTarget: salvoMoveTarget ? { ...salvoMoveTarget } : null,
    ...overrides,
  })
  const noAttack = (
    nextReload = reload,
    resetSalvo = false,
    debugStateOverrides: Partial<HostileAttackDebugState> = {},
  ): AttackResolution => {
    const nextSalvoShotsRemaining = resetSalvo ? 0 : salvoShotsRemaining
    const nextSalvoStepDirection = resetSalvo ? null : salvoStepDirection
    const nextSalvoMoveTarget = resetSalvo ? null : salvoMoveTarget

    return {
      torpedoes: [],
      depthCharges: [],
      reload: nextReload,
      torpedoAmmo,
      vlsAmmo,
      depthChargeAmmo,
      salvoShotsRemaining: nextSalvoShotsRemaining,
      salvoStepDirection: nextSalvoStepDirection,
      salvoMoveTarget: nextSalvoMoveTarget,
      debugState: createDebugState({
        salvoShotsRemaining: nextSalvoShotsRemaining,
        salvoStepDirection: nextSalvoStepDirection,
        salvoMoveTarget: nextSalvoMoveTarget ? { ...nextSalvoMoveTarget } : null,
        ...debugStateOverrides,
      }),
    }
  }

  if (!lastKnownPlayerPosition || reload > 0) {
    return noAttack(reload, !lastKnownPlayerPosition, {
      blockedReason: lastKnownPlayerPosition ? "reloading" : "no player fix",
    })
  }

  if ((archetype === "hunter" || archetype === "guard") && !directDetection) {
    return noAttack(reload, true, {
      blockedReason: "needs direct detection",
    })
  }

  if (
    (archetype === "hunter" || archetype === "guard") &&
    chebyshevDistance(position, lastKnownPlayerPosition) >
      HOSTILE_PLAYER_DETECTION_RADIUS
  ) {
    return noAttack(reload, true, {
      blockedReason: "player outside attack radius",
    })
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
    guessedTarget.x = lastKnownPlayerPosition.x
    guessedTarget.y = lastKnownPlayerPosition.y
  }
  const horizontalShotOpportunity = hasHorizontalShotOpportunity(
    map,
    position,
    lastKnownPlayerPosition,
  )
  const verticalShotOpportunity = hasVerticalShotOpportunity(
    map,
    position,
    lastKnownPlayerPosition,
  )
  const ceilingTrapShot = findCeilingTrapShot(
    map,
    position,
    lastKnownPlayerPosition,
  )
  const attackTarget = ceilingTrapShot?.impactPoint ??
    (horizontalShotOpportunity
      ? createHorizontalShotTarget(position, lastKnownPlayerPosition)
      : verticalShotOpportunity
      ? createVerticalShotTarget(position, lastKnownPlayerPosition)
      : guessedTarget)

  const turnAge = lastKnownPlayerTurn === null
    ? Number.POSITIVE_INFINITY
    : turn - lastKnownPlayerTurn
  const maxEvidenceAge = archetype === "hunter" ? 2 : 1
  const confidence = archetype === "hunter"
    ? turnAge === 0 ? 0.32 : 0.16
    : turnAge === 0
    ? 0.62
    : 0.28
  const debugStateBase = {
    attackTarget: { ...attackTarget },
    guessedTarget: { ...guessedTarget },
    directLane,
    horizontalShotOpportunity,
    verticalShotOpportunity,
    ceilingTrapDirection: ceilingTrapShot?.direction ?? null,
    turnAge,
    maxEvidenceAge,
    confidence,
    avoidFriendlyFire: archetype === "scout",
  } satisfies Partial<HostileAttackDebugState>

  if (turnAge > maxEvidenceAge) {
    return noAttack(reload, true, {
      ...debugStateBase,
      blockedReason: "stale player fix",
    })
  }

  if (
    archetype !== "hunter" &&
    !directLane &&
    !horizontalShotOpportunity &&
    !verticalShotOpportunity &&
    !ceilingTrapShot &&
    random() > confidence
  ) {
    return noAttack(reload, false, {
      ...debugStateBase,
      blockedReason: "low confidence shot skipped",
    })
  }

  const avoidFriendlyFire = archetype === "scout"

  if (
    avoidFriendlyFire &&
    !isAttackLaneSafe(attackTarget, hostileSubmarine, hostileSubmarines)
  ) {
    return noAttack(reload, false, {
      ...debugStateBase,
      blockedReason: "friendly fire risk",
    })
  }

  const torpedoes: Torpedo[] = []
  const depthCharges: DepthCharge[] = []
  let nextReload = HOSTILE_TORPEDO_COOLDOWN
  let nextTorpedoAmmo = torpedoAmmo
  let nextVlsAmmo = vlsAmmo
  let nextDepthChargeAmmo = depthChargeAmmo
  let nextSalvoShotsRemaining = salvoShotsRemaining
  let nextSalvoStepDirection = salvoStepDirection
  let nextSalvoMoveTarget = salvoMoveTarget
    ? { ...salvoMoveTarget }
    : null
  let firedOrientation: "horizontal" | "vertical" | null = null
  let firedWeapon: HostileAttackDebugState["firedWeapon"] = null
  let firedDirection: Direction | null = null

  if (horizontalShotOpportunity && nextTorpedoAmmo > 0) {
    const direction: Direction = lastKnownPlayerPosition.x < position.x
      ? "left"
      : "right"
    torpedoes.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      direction,
      speed: TORPEDO_SPEED,
      rangeRemaining: HOSTILE_TORPEDO_RANGE,
      avoidFriendlyFire,
    })
    nextTorpedoAmmo -= 1
    firedOrientation = "horizontal"
    firedWeapon = "torpedo"
    firedDirection = direction
  } else if (verticalShotOpportunity && nextVlsAmmo > 0) {
    torpedoes.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      direction: "up",
      speed: TORPEDO_SPEED,
      rangeRemaining: HOSTILE_TORPEDO_RANGE,
      avoidFriendlyFire,
    })
    nextVlsAmmo -= 1
    firedOrientation = "vertical"
    firedWeapon = "vls"
    firedDirection = "up"
  } else if (ceilingTrapShot && nextTorpedoAmmo > 0 && ceilingTrapShot.direction !== "up") {
    torpedoes.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      direction: ceilingTrapShot.direction,
      speed: TORPEDO_SPEED,
      rangeRemaining: HOSTILE_TORPEDO_RANGE,
      avoidFriendlyFire,
    })
    nextTorpedoAmmo -= 1
    firedWeapon = "torpedo"
    firedDirection = ceilingTrapShot.direction
  } else if (ceilingTrapShot && nextVlsAmmo > 0 && ceilingTrapShot.direction === "up") {
    torpedoes.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      direction: "up",
      speed: TORPEDO_SPEED,
      rangeRemaining: HOSTILE_TORPEDO_RANGE,
      avoidFriendlyFire,
    })
    nextVlsAmmo -= 1
    firedOrientation = "vertical"
    firedWeapon = "vls"
    firedDirection = "up"
  } else if (
    directLane &&
    lastKnownPlayerPosition.x === position.x &&
    lastKnownPlayerPosition.y >= position.y &&
    nextDepthChargeAmmo > 0
  ) {
    depthCharges.push({
      position: { ...position },
      senderId: hostileSubmarine.id,
      speed: DEPTH_CHARGE_SPEED,
      rangeRemaining: DEPTH_CHARGE_RANGE,
      avoidFriendlyFire,
    })
    nextDepthChargeAmmo -= 1
    firedWeapon = "depth-charge"
  }

  if (torpedoes.length === 0 && depthCharges.length === 0) {
    return noAttack(Math.max(0, reload), archetype === "hunter", {
      ...debugStateBase,
      blockedReason: "no valid weapon solution",
    })
  }

  if (archetype === "hunter" && firedOrientation) {
    if (nextSalvoShotsRemaining > 0) {
      nextSalvoShotsRemaining = 0
      nextSalvoStepDirection = null
      nextSalvoMoveTarget = null
    } else {
      const occupied = new Set(
        hostileSubmarines
          .filter((candidate) => candidate.id !== hostileSubmarine.id)
          .map((candidate) => keyOfPoint(candidate.position)),
      )
      const nextDirection = chooseSalvoStepDirection(
        map,
        position,
        firedOrientation,
        occupied,
        random,
      )
      const moveTarget = nextDirection
        ? createNextSalvoMoveTarget(map, position, nextDirection, occupied)
        : null

      nextSalvoShotsRemaining = moveTarget ? 1 : 0
      nextSalvoStepDirection = moveTarget ? nextDirection : null
      nextSalvoMoveTarget = moveTarget
    }
  } else if (archetype !== "hunter") {
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
    debugState: createDebugState({
      ...debugStateBase,
      firedWeapon,
      firedDirection,
      salvoShotsRemaining: nextSalvoShotsRemaining,
      salvoStepDirection: nextSalvoStepDirection,
      salvoMoveTarget: nextSalvoMoveTarget ? { ...nextSalvoMoveTarget } : null,
    }),
  }
}

function chooseSalvoStepDirection(
  map: GeneratedMap,
  position: Point,
  orientation: "horizontal" | "vertical",
  occupied: ReadonlySet<string>,
  random: () => number,
): Direction | null {
  const directions = orientation === "horizontal"
    ? (random() < 0.5
      ? ["up", "down"] as const
      : ["down", "up"] as const)
    : (random() < 0.5
      ? ["left", "right"] as const
      : ["right", "left"] as const)

  for (const direction of directions) {
    if (createNextSalvoMoveTarget(map, position, direction, occupied)) {
      return direction
    }
  }

  return null
}

function createNextSalvoMoveTarget(
  map: GeneratedMap,
  position: Point,
  direction: Direction,
  occupied?: ReadonlySet<string>,
): Point | null {
  const delta = deltaForDirection(direction)
  const lane = Array.from(
    { length: HOSTILE_SALVO_OFFSET },
    (_, index) => ({
      x: position.x + delta.x * (index + 1),
      y: position.y + delta.y * (index + 1),
    }),
  )
  const target = lane[HOSTILE_SALVO_OFFSET - 1]

  if (lane.every((point) => isPassableTile(tileAt(map, point.x, point.y))) &&
    !occupied?.has(keyOfPoint(target))) {
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
    case "guard":
      return HOSTILE_GUARD_SONAR_INTERVAL
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
  previousPosition: Point | null,
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

  const nonBacktrackingOptions = previousPosition
    ? options.filter((point) => !pointsEqual(point, previousPosition))
    : options

  return nonBacktrackingOptions[0] ?? options[0] ?? null
}

function keepPatrolPath(
  map: GeneratedMap,
  start: Point,
  target: Point,
  occupied: Set<string>,
  plannedPath: readonly Point[],
): Point[] | null {
  if (
    pointsEqual(start, target) ||
    !isPassableTile(tileAt(map, target.x, target.y)) ||
    occupied.has(keyOfPoint(target))
  ) {
    return null
  }

  if (isReusablePlannedPath(map, start, target, occupied, plannedPath)) {
    return plannedPath.map((point) => ({ ...point }))
  }

  const nextPath = findPathToward(map, start, target, occupied)
  return nextPath.length > 1 ? nextPath : null
}

function keepInvestigationPath(
  map: GeneratedMap,
  start: Point,
  target: Point,
  cluePosition: Point,
  occupied: Set<string>,
  plannedPath: readonly Point[],
): Point[] | null {
  if (chebyshevDistance(target, cluePosition) > HOSTILE_PLAYER_CLUE_RADIUS) {
    return null
  }

  return keepPatrolPath(map, start, target, occupied, plannedPath)
}

function isReusablePlannedPath(
  map: GeneratedMap,
  start: Point,
  target: Point,
  occupied: ReadonlySet<string>,
  plannedPath: readonly Point[],
): boolean {
  if (plannedPath.length <= 1) {
    return false
  }

  if (
    !pointsEqual(plannedPath[0], start) ||
    !pointsEqual(plannedPath[plannedPath.length - 1], target)
  ) {
    return false
  }

  for (let index = 0; index < plannedPath.length; index += 1) {
    const point = plannedPath[index]

    if (!isPassableTile(tileAt(map, point.x, point.y))) {
      return false
    }

    if (index > 0) {
      const previousPoint = plannedPath[index - 1]

      if (!areCardinalNeighbors(previousPoint, point) || occupied.has(keyOfPoint(point))) {
        return false
      }
    }
  }

  return true
}

function canAdvancePlannedPath(
  plannedPath: readonly Point[],
  movementTarget: Point | null,
  finalTarget: Point | null,
): boolean {
  return movementTarget !== null && finalTarget !== null &&
    pointsEqual(movementTarget, finalTarget) && plannedPath.length > 0 &&
    pointsEqual(plannedPath[plannedPath.length - 1], movementTarget)
}

function canReuseCurrentPlannedPath(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  archetype: HostileSubmarineArchetype,
  position: Point,
  movementTarget: Point | null,
  occupied: ReadonlySet<string>,
  player: Point,
  reload: number,
  directDetection: boolean,
  repositioningForSalvo: boolean,
): boolean {
  if (
    movementTarget === null ||
    repositioningForSalvo ||
    archetype === "turtle" ||
    (archetype === "scout" && hostileSubmarine.lastKnownPlayerPosition)
  ) {
    return false
  }

  if (shouldHoldAttackPosition(
    map,
    hostileSubmarine,
    archetype,
    position,
    movementTarget,
    reload,
    directDetection,
  )) {
    return false
  }

  return isReusablePlannedPath(
    map,
    position,
    movementTarget,
    occupied,
    hostileSubmarine.plannedPath,
  )
}

function canUsePlannedPathForMovement(
  map: GeneratedMap,
  hostileSubmarine: ResolvedHostileSubmarine,
  archetype: HostileSubmarineArchetype,
  position: Point,
  target: Point | null,
  movementTarget: Point | null,
  occupied: ReadonlySet<string>,
  player: Point,
  reload: number,
  directDetection: boolean,
  repositioningForSalvo: boolean,
  plannedPath: readonly Point[] | null,
): plannedPath is Point[] {
  if (plannedPath === null || target === null || movementTarget === null) {
    return false
  }

  if (!pointsEqual(target, movementTarget)) {
    return false
  }

  if (
    repositioningForSalvo ||
    archetype === "turtle" ||
    (archetype === "scout" && hostileSubmarine.lastKnownPlayerPosition)
  ) {
    return false
  }

  if (shouldHoldAttackPosition(
    map,
    hostileSubmarine,
    archetype,
    position,
    movementTarget,
    reload,
    directDetection,
  )) {
    return false
  }

  return isReusablePlannedPath(map, position, movementTarget, occupied, plannedPath)
}

function advancePlannedPath(plannedPath: readonly Point[]): Point[] {
  const nextPath = plannedPath.length > 1 ? plannedPath.slice(1) : plannedPath
  return nextPath.map((point) => ({ ...point }))
}

function areCardinalNeighbors(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1
}

function chooseCoordinatedClueTarget(
  map: GeneratedMap,
  position: Point,
  cluePosition: Point,
  occupied: Set<string>,
  reservedTargets: ReadonlySet<string>,
  random: () => number,
): Point {
  const reservedPoints = pointsFromReservedTargets(reservedTargets)

  return findBestReachableTarget(
    map,
    position,
    occupied,
    random,
    (point) => chebyshevDistance(point, cluePosition) <= HOSTILE_PLAYER_CLUE_RADIUS,
    (point) =>
      scoreInvestigationTarget(point, cluePosition, position, reservedPoints),
  ) ?? { ...cluePosition }
}

function chooseCoordinatedSearchTarget(
  map: GeneratedMap,
  position: Point,
  occupied: Set<string>,
  reservedTargets: ReadonlySet<string>,
  random: () => number,
  previousPosition: Point | null,
): Point | null {
  const reservedPoints = pointsFromReservedTargets(reservedTargets)

  return findBestReachableTarget(
    map,
    position,
    occupied,
    random,
    (point) => !previousPosition || !pointsEqual(point, previousPosition),
    (point) => scoreSearchTarget(point, position, reservedPoints),
  )
}

function scoreInvestigationTarget(
  point: Point,
  cluePosition: Point,
  start: Point,
  reservedPoints: readonly Point[],
): number {
  return reservationSeparationScore(point, reservedPoints) * 18 -
    chebyshevDistance(point, cluePosition) * 9 -
    chebyshevDistance(point, start)
}

function scoreSearchTarget(
  point: Point,
  start: Point,
  reservedPoints: readonly Point[],
): number {
  return reservationSeparationScore(point, reservedPoints) * 16 +
    chebyshevDistance(point, start) * 2
}

function reservationSeparationScore(
  point: Point,
  reservedPoints: readonly Point[],
): number {
  let bestDistance = HOSTILE_COMMUNICATION_RADIUS

  for (const reservedTarget of reservedPoints) {
    const distance = chebyshevDistance(point, reservedTarget)
    bestDistance = Math.min(bestDistance, distance)
  }

  return bestDistance
}

function pointsFromReservedTargets(
  reservedTargets: ReadonlySet<string>,
): Point[] {
  return Array.from(reservedTargets, (reservedTarget) => {
    const [xText, yText] = reservedTarget.split(":")
    return {
      x: Number(xText),
      y: Number(yText),
    }
  })
}

function findBestReachableTarget(
  map: GeneratedMap,
  start: Point,
  occupied: ReadonlySet<string>,
  random: () => number,
  isCandidate: (point: Point) => boolean,
  scoreCandidate: (point: Point) => number,
): Point | null {
  const width = map.width
  const totalTiles = map.tiles.length
  const queue = new Int32Array(totalTiles)
  const visited = new Uint8Array(totalTiles)
  const occupiedIndexes = occupiedIndexesForPath(width, occupied)
  const startIndex = indexForPoint(width, start)
  const neighborIndexes = new Int32Array(4)
  const neighborScores = new Int32Array(4)
  let queueStart = 0
  let queueEnd = 1
  let bestIndex = -1
  let bestScore = Number.NEGATIVE_INFINITY

  queue[0] = startIndex
  visited[startIndex] = 1

  while (queueStart < queueEnd) {
    const currentIndex = queue[queueStart]
    queueStart += 1
    const current = pointFromIndex(width, currentIndex)

    if (currentIndex !== startIndex && isCandidate(current)) {
      const score = scoreCandidate(current)

      if (
        score > bestScore ||
        (score === bestScore && random() >= 0.5)
      ) {
        bestIndex = currentIndex
        bestScore = score
      }
    }

    const neighborCount = fillOrderedNeighborIndexes(
      width,
      map.height,
      currentIndex,
      start,
      neighborIndexes,
      neighborScores,
    )

    for (let index = 0; index < neighborCount; index += 1) {
      const nextIndex = neighborIndexes[index]

      if (
        visited[nextIndex] === 1 ||
        !isPassableTile(map.tiles[nextIndex]) ||
        occupiedIndexes.has(nextIndex)
      ) {
        continue
      }

      visited[nextIndex] = 1
      queue[queueEnd] = nextIndex
      queueEnd += 1
    }
  }

  return bestIndex >= 0 ? pointFromIndex(width, bestIndex) : null
}

function chooseGuardPatrolTarget(
  map: GeneratedMap,
  capsule: Point,
  guardPost: Point,
  position: Point,
  occupied: Set<string>,
  random: () => number,
  previousPosition: Point | null,
): Point | null {
  const candidates: Point[] = []

  for (
    let y = Math.max(1, capsule.y - HOSTILE_GUARD_MAX_CAPSULE_DISTANCE);
    y <= Math.min(map.height - 2, capsule.y + HOSTILE_GUARD_MAX_CAPSULE_DISTANCE);
    y += 1
  ) {
    for (
      let x = Math.max(1, capsule.x - HOSTILE_GUARD_MAX_CAPSULE_DISTANCE);
      x <= Math.min(map.width - 2, capsule.x + HOSTILE_GUARD_MAX_CAPSULE_DISTANCE);
      x += 1
    ) {
      const point = { x, y }
      const capsuleDistance = chebyshevDistance(point, capsule)

      if (
        pointsEqual(point, position) ||
        !isPassableTile(tileAt(map, point.x, point.y)) ||
        occupied.has(keyOfPoint(point)) ||
        capsuleDistance < HOSTILE_GUARD_MIN_CAPSULE_DISTANCE ||
        capsuleDistance > HOSTILE_GUARD_MAX_CAPSULE_DISTANCE
      ) {
        continue
      }

      candidates.push(point)
    }
  }

  const shuffledCandidates = shufflePoints(candidates, random)
  const nonBacktrackingCandidates = previousPosition
    ? shuffledCandidates.filter((point) => !pointsEqual(point, previousPosition))
    : shuffledCandidates
  const rankedCandidates = (nonBacktrackingCandidates.length > 0
    ? nonBacktrackingCandidates
    : shuffledCandidates).sort((left, right) => {
      const leftScore = chebyshevDistance(left, guardPost) * 8 +
        chebyshevDistance(left, position)
      const rightScore = chebyshevDistance(right, guardPost) * 8 +
        chebyshevDistance(right, position)
      return leftScore - rightScore
    })

  return rankedCandidates[0] ??
    choosePatrolStep(map, position, occupied, random, previousPosition)
}

function findScoutExplorationTarget(
  map: GeneratedMap,
  memory: Array<TileKind | null>,
  start: Point,
  occupied: Set<string>,
  random: () => number,
): Point | null {
  const queue: Point[] = [{ ...start }]
  let queueIndex = 0
  const parents = new Map<string, Point | null>()
  parents.set(keyOfPoint(start), null)
  const candidates: Array<{ point: Point; score: number }> = []
  let fallback: Point | null = null
  let fallbackDistance = -1

  while (queueIndex < queue.length) {
    const current = queue[queueIndex]
    queueIndex += 1

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
  memory: Array<TileKind | null>,
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
  memory: Array<TileKind | null>,
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
  const width = map.width
  const totalTiles = map.tiles.length
  const startIndex = indexForPoint(width, start)
  const goalIndex = indexForPoint(width, goal)

  if (startIndex === goalIndex) {
    return [{ ...start }]
  }

  const queue = new Int32Array(totalTiles)
  const parents = new Int32Array(totalTiles)
  const occupiedIndexes = occupiedIndexesForPath(width, occupied)
  const neighborIndexes = new Int32Array(4)
  const neighborScores = new Int32Array(4)
  let queueStart = 0
  let queueEnd = 1

  parents.fill(-2)
  parents[startIndex] = -1
  queue[0] = startIndex

  while (queueStart < queueEnd) {
    const currentIndex = queue[queueStart]
    queueStart += 1

    if (currentIndex === goalIndex) {
      break
    }

    const neighborCount = fillOrderedNeighborIndexes(
      width,
      map.height,
      currentIndex,
      goal,
      neighborIndexes,
      neighborScores,
    )

    for (let index = 0; index < neighborCount; index += 1) {
      const nextIndex = neighborIndexes[index]

      if (parents[nextIndex] !== -2 || !isPassableTile(map.tiles[nextIndex])) {
        continue
      }

      if (occupiedIndexes.has(nextIndex) && nextIndex !== goalIndex) {
        continue
      }

      parents[nextIndex] = currentIndex
      queue[queueEnd] = nextIndex
      queueEnd += 1
    }
  }

  if (parents[goalIndex] === -2) {
    return [{ ...start }]
  }

  const path: Point[] = []
  let cursorIndex = goalIndex

  while (cursorIndex !== -1) {
    path.push(pointFromIndex(width, cursorIndex))
    cursorIndex = parents[cursorIndex]
  }

  path.reverse()
  return path
}

function occupiedIndexesForPath(
  width: number,
  occupied: ReadonlySet<string>,
): Set<number> {
  const indexes = new Set<number>()

  for (const pointKey of occupied) {
    indexes.add(indexForPoint(width, pointFromKey(pointKey)))
  }

  return indexes
}

function pointFromKey(pointKey: string): Point {
  const separatorIndex = pointKey.indexOf(":")
  return {
    x: Number(pointKey.slice(0, separatorIndex)),
    y: Number(pointKey.slice(separatorIndex + 1)),
  }
}

function pointFromIndex(width: number, index: number): Point {
  return {
    x: index % width,
    y: Math.floor(index / width),
  }
}

function fillOrderedNeighborIndexes(
  width: number,
  height: number,
  pointIndex: number,
  goal: Point,
  neighborIndexes: Int32Array,
  neighborScores: Int32Array,
): number {
  const x = pointIndex % width
  const y = Math.floor(pointIndex / width)
  let neighborCount = 0

  const insertNeighbor = (nextIndex: number, nextX: number, nextY: number) => {
    const score = Math.abs(nextX - goal.x) + Math.abs(nextY - goal.y)
    let insertIndex = neighborCount

    while (insertIndex > 0 && neighborScores[insertIndex - 1] > score) {
      neighborIndexes[insertIndex] = neighborIndexes[insertIndex - 1]
      neighborScores[insertIndex] = neighborScores[insertIndex - 1]
      insertIndex -= 1
    }

    neighborIndexes[insertIndex] = nextIndex
    neighborScores[insertIndex] = score
    neighborCount += 1
  }

  if (x + 1 < width) {
    insertNeighbor(pointIndex + 1, x + 1, y)
  }

  if (x > 0) {
    insertNeighbor(pointIndex - 1, x - 1, y)
  }

  if (y + 1 < height) {
    insertNeighbor(pointIndex + width, x, y + 1)
  }

  if (y > 0) {
    insertNeighbor(pointIndex - width, x, y - 1)
  }

  return neighborCount
}

function orderedNeighbors(point: Point, goal: Point): Point[] {
  const neighbors = CARDINAL_STEPS.map((step) => ({
    x: point.x + step.x,
    y: point.y + step.y,
  }))
  const scores = neighbors.map((neighbor) => distanceScore(neighbor, goal))

  for (let index = 1; index < neighbors.length; index += 1) {
    const neighbor = neighbors[index]
    const score = scores[index]
    let previousIndex = index - 1

    while (previousIndex >= 0 && scores[previousIndex] > score) {
      neighbors[previousIndex + 1] = neighbors[previousIndex]
      scores[previousIndex + 1] = scores[previousIndex]
      previousIndex -= 1
    }

    neighbors[previousIndex + 1] = neighbor
    scores[previousIndex + 1] = score
  }

  return neighbors
}

function distanceScore(point: Point, goal: Point): number {
  return Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y)
}
