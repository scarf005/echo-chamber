import { i18n } from "../i18n.ts"
import {
  PASSIVE_EXACT_RADIUS,
  CRACK_DECAY,
  DEPTH_CHARGE_RANGE,
  DEPTH_CHARGE_SPEED,
  DUST_DECAY,
  SHAKE_DECAY,
  SONAR_INTERVAL,
  TORPEDO_RANGE,
  TORPEDO_SPEED,
  TRAIL_DECAY,
} from "./constants.ts"
import { randomIntegerBetween } from "jsr:@std/random"
import {
  decayCells,
  decayCracks,
  decayShake,
  decayTrailCells,
  mergeTrailCell,
  resolveImpactMessage,
} from "./effects.ts"
import {
  chebyshevDistance,
  cloneBoulder,
  cloneDepthCharge,
  cloneFish,
  cloneHostileSubmarine,
  cloneMap,
  cloneTorpedo,
  indexForPoint,
  pointsEqual,
} from "./helpers.ts"
import { isPlayerSonarEnabled } from "./actions.ts"
import { createLogMessage, MAX_LOG_MESSAGES, withGameMessage } from "./log.ts"
import { collectPickups } from "./items.ts"
import { WIN_SEED_MODE_HINT } from "../runSeed.ts"
import { emitVentPlumes } from "./vents.ts"
import type {
  EntityReveal,
  Fish,
  GameState,
  GameStatus,
  HostileSubmarine,
  HorizontalDirection,
  LogMessage,
  RevealableEntity,
  SonarContactAudioVariant,
  Shockwave,
  TurnAction,
} from "./model.ts"
import { refreshPerception, revealMap } from "./perception.ts"
import type { Point } from "./mapgen.ts"
import { clearKelpStrandAt, isPassableTile, tileAt } from "./mapgen.ts"
import { stepFallingBoulders } from "./systems/boulders.ts"
import { stepFish } from "./systems/fish.ts"
import { stepHostileSubmarines } from "./systems/hostiles.ts"
import { stepDepthCharges, stepTorpedoes } from "./systems/projectiles.ts"
import {
  didShockwaveReachPointThisTurn,
  previewShockwaveEntityReveals,
  stepShockwaves,
} from "./systems/shockwaves.ts"

export function advanceTurn(
  game: GameState,
  nextPlayer: Point,
  facing: HorizontalDirection,
  action: TurnAction | null,
  fallbackMessage: LogMessage | string,
): GameState {
  const nextTurn = game.turn + 1
  const map = cloneMap(game.map)
  const hadCapsule = game.capsuleCollected ?? false
  let torpedoes = game.torpedoes.map(cloneTorpedo)
  let depthCharges = game.depthCharges.map(cloneDepthCharge)
  let fish = (game.fish ?? []).map(cloneFish)
  let hostileSubmarines = game.hostileSubmarines.map(cloneHostileSubmarine)
  let pickups = game.pickups.map((pickup) => ({
    ...pickup,
    position: { ...pickup.position },
  }))
  let trails = decayTrailCells(map, game.trails, TRAIL_DECAY)
  let dust = decayCells(game.dust, DUST_DECAY)
  let cracks = decayCracks(game.cracks, CRACK_DECAY)
  let structuralDamage = game.structuralDamage?.slice() ??
    Array.from({ length: map.tiles.length }, () => 0)
  let fallingBoulders = game.fallingBoulders.map(cloneBoulder)
  let torpedoAmmo = game.torpedoAmmo
  let depthChargeAmmo = game.depthChargeAmmo
  let screenShake = decayShake(game.screenShake, SHAKE_DECAY)
  let rammedFishCount =
    fish.filter((candidate) => pointsEqual(candidate.position, nextPlayer))
      .length
  fish = fish.filter((candidate) =>
    !pointsEqual(candidate.position, nextPlayer)
  )
  let playerDestroyed = hostileSubmarines.some((hostileSubmarine) =>
    pointsEqual(hostileSubmarine.position, nextPlayer)
  )
  let hostileMessage: LogMessage | null = playerDestroyed
    ? createLogMessage(
      "A hostile submarine rams your hull. Press R for a new run.",
      "negative",
    )
    : null
  const playerMoved = nextPlayer.x !== game.player.x || nextPlayer.y !== game.player.y

  if (playerMoved) {
    trails = mergeTrailCell(trails, indexForPoint(map.width, game.player), 1)
  }

  trails = emitVentPlumes(map, game.seed, nextTurn, trails)

  const cutKelp = playerMoved && clearKelpStrandAt(map, nextPlayer)

  if (action?.kind === "torpedo") {
    torpedoes.push({
      position: { ...nextPlayer },
      senderId: "player",
      direction: action.direction,
      speed: TORPEDO_SPEED,
      rangeRemaining: TORPEDO_RANGE,
    })
    torpedoAmmo -= 1
  }

  if (action?.kind === "depth-charge") {
    depthCharges.push({
      position: { ...nextPlayer },
      senderId: "player",
      speed: DEPTH_CHARGE_SPEED,
      rangeRemaining: DEPTH_CHARGE_RANGE,
    })
    depthChargeAmmo -= 1
  }

  const torpedoStep = stepTorpedoes(
    map,
    torpedoes,
    trails,
    cracks,
    structuralDamage,
    dust,
    fish,
    hostileSubmarines,
    nextPlayer,
    game.seed,
    nextTurn,
  )
  torpedoes = torpedoStep.torpedoes
  trails = torpedoStep.trails
  cracks = torpedoStep.cracks
  structuralDamage = torpedoStep.structuralDamage
  dust = torpedoStep.dust
  fish = torpedoStep.fish
  hostileSubmarines = torpedoStep.hostileSubmarines
  fallingBoulders = [...fallingBoulders, ...torpedoStep.fallingBoulders]
  screenShake = Math.max(screenShake, torpedoStep.screenShake)
  playerDestroyed = playerDestroyed || torpedoStep.playerDestroyed

  if (torpedoStep.playerDestroyed) {
    hostileMessage = createLogMessage(
        "A hostile torpedo tears through your hull. Press R for a new run.",
      "negative",
    )
  }

  const depthChargeStep = stepDepthCharges(
    map,
    depthCharges,
    trails,
    cracks,
    structuralDamage,
    dust,
    fish,
    hostileSubmarines,
    nextPlayer,
    game.seed,
    nextTurn,
  )
  depthCharges = depthChargeStep.depthCharges
  trails = depthChargeStep.trails
  cracks = depthChargeStep.cracks
  structuralDamage = depthChargeStep.structuralDamage
  dust = depthChargeStep.dust
  fish = depthChargeStep.fish
  hostileSubmarines = depthChargeStep.hostileSubmarines
  fallingBoulders = [...fallingBoulders, ...depthChargeStep.fallingBoulders]
  screenShake = Math.max(screenShake, depthChargeStep.screenShake)
  playerDestroyed = playerDestroyed || depthChargeStep.playerDestroyed

  if (depthChargeStep.playerDestroyed) {
    hostileMessage = createLogMessage(
        "A hostile blast caves in your hull. Press R for a new run.",
      "negative",
    )
  }

  const boulderStep = stepFallingBoulders(
    map,
    fallingBoulders,
    trails,
    dust,
    nextPlayer,
    fish,
    hostileSubmarines,
  )
  fallingBoulders = boulderStep.fallingBoulders
  trails = boulderStep.trails
  dust = boulderStep.dust
  fish = boulderStep.fish
  hostileSubmarines = boulderStep.hostileSubmarines
  screenShake = Math.max(screenShake, boulderStep.screenShake)
  playerDestroyed = playerDestroyed || boulderStep.playerDestroyed

  if (boulderStep.playerDestroyed) {
    hostileMessage = createLogMessage(
        "Cave-in debris crushes your hull. Press R for a new run.",
      "negative",
    )
  }

  const capsuleRetrievedThisTurn = !hadCapsule && !playerDestroyed &&
    pointsEqual(nextPlayer, map.capsule)

  const playerSonarEnabled = isPlayerSonarEnabled(game)
  const shouldEmitSonar = playerSonarEnabled && nextTurn % SONAR_INTERVAL === 0
  const spawnedShockwaves: Shockwave[] = [
    ...torpedoStep.shockwaves,
    ...depthChargeStep.shockwaves,
    ...(shouldEmitSonar ? [createSonarShockwave(nextPlayer)] : []),
  ]
  let hostileAiLogs: LogMessage[] = []
  const revealableEntitiesBeforeHostiles = collectRevealableEntities(
    nextPlayer,
    map.capsule,
    hadCapsule || capsuleRetrievedThisTurn,
    torpedoes,
    depthCharges,
    pickups,
    fallingBoulders,
    fish,
    hostileSubmarines,
  )
  const preHostileEntityReveals = previewShockwaveEntityReveals(
    map,
    game.shockwaves,
    spawnedShockwaves,
    dust,
    trails,
    revealableEntitiesBeforeHostiles,
  )
  const playerSonarMadePreHostileContact = preHostileEntityReveals.some(
    (reveal) => reveal.sourceSenderId === "player" && reveal.kind !== "player",
  )
  const playerSonarHitHostiles = new Set(
    hostileSubmarines
      .filter((hostileSubmarine) =>
        preHostileEntityReveals.some((reveal) =>
          reveal.sourceSenderId === "player" && reveal.kind === "enemy" &&
          reveal.index ===
            indexForPoint(map.width, hostileSubmarine.position)
        )
      )
      .map((hostileSubmarine) => hostileSubmarine.id),
  )

  if (!playerDestroyed) {
    const fishStep = stepFish(
      map,
      fish,
      {
        player: nextPlayer,
        hostileSubmarines,
      },
      game.seed,
      nextTurn,
    )
    fish = fishStep.fish
    rammedFishCount += fishStep.rammedFishCount
  }

  if (!playerDestroyed) {
    const hostileStep = stepHostileSubmarines(
      map,
      hostileSubmarines,
      {
        player: nextPlayer,
        previousPlayer: game.player,
        shockwaves: [...game.shockwaves, ...spawnedShockwaves],
        trails,
        memory: map.tiles.slice(),
        playerSonarHitHostiles,
        capsuleRetrievedThisTurn,
      },
      game.seed,
      nextTurn,
    )

    hostileSubmarines = hostileStep.hostileSubmarines
    torpedoes = [...torpedoes, ...hostileStep.launchedTorpedoes]
    depthCharges = [...depthCharges, ...hostileStep.launchedDepthCharges]
    spawnedShockwaves.push(...hostileStep.spawnedShockwaves)
    hostileAiLogs = hostileStep.aiDecisionLogs.map((message) =>
      createLogMessage(message, "ai")
    )
    playerDestroyed = hostileStep.playerDestroyed

    if (hostileStep.playerDestroyed) {
      hostileMessage = createLogMessage(
        "A hostile submarine rams your hull. Press R for a new run.",
        "negative",
      )
    }
  }

  const revealableEntitiesAfterHostiles = collectRevealableEntities(
    nextPlayer,
    map.capsule,
    hadCapsule || capsuleRetrievedThisTurn,
    torpedoes,
    depthCharges,
    pickups,
    fallingBoulders,
    fish,
    hostileSubmarines,
  )
  const hostileSonarContact = collectHostileSonarContacts(
    map,
    hostileSubmarines,
    game.shockwaves,
    spawnedShockwaves,
    dust,
    trails,
    revealableEntitiesAfterHostiles,
    nextPlayer,
  )
  const hostileSonarMessage = hostileSonarContact.direction !== null
    ? createLogMessage(
      i18n._("hostile sonar from {direction}", { direction: hostileSonarContact.direction }),
      "negative",
    )
    : null

  const shockwaveStep = stepShockwaves(
    map,
    game.shockwaves,
    spawnedShockwaves,
    dust,
    trails,
    revealableEntitiesAfterHostiles,
  )
  const playerSonarMadeContact = playerSonarMadePreHostileContact ||
    shockwaveStep.revealedEntities.some(
      (reveal) =>
        reveal.sourceSenderId === "player" && reveal.kind !== "player",
    )
  const playerSonarContactAudioVariant = playerSonarMadeContact
    ? resolvePlayerSonarContactAudioVariant(
      map.width,
      preHostileEntityReveals,
      fish,
      game.hostileSubmarines,
      shockwaveStep.revealedEntities,
      fish,
      hostileSubmarines,
    )
    : null
  const playerEntityHitThisTurn = rammedFishCount > 0 ||
    cutKelp ||
    torpedoStep.impacts > 0 ||
    depthChargeStep.impacts > 0 ||
    torpedoStep.playerEntityHits > 0 ||
    depthChargeStep.playerEntityHits > 0
  const playerDiedThisTurn = game.status !== "lost" && playerDestroyed
  const pickupStep = collectPickups(
    {
      ...game,
      map,
      player: { ...nextPlayer },
      turn: nextTurn,
      pickups,
      torpedoAmmo,
      depthChargeAmmo,
    },
    nextPlayer,
    pickups,
  )
  const playerCollectedPickup = pickupStep.pickups.length !== pickups.length
  pickups = pickupStep.pickups
  torpedoAmmo = pickupStep.torpedoAmmo
  depthChargeAmmo = pickupStep.depthChargeAmmo
  const capsuleCollected = playerDestroyed
    ? hadCapsule
    : hadCapsule || capsuleRetrievedThisTurn

  const won = capsuleCollected && pointsEqual(nextPlayer, map.spawn)
  const impactMessage = resolveImpactMessage(
    torpedoStep.impacts,
    depthChargeStep.impacts,
    torpedoStep.caveIns,
    0,
  )
  const detectionLogs = [
    ...torpedoStep.impactPoints.map((point) =>
      createDirectionalDetectionLog(nextPlayer, point, "explosion")
    ),
    ...depthChargeStep.impactPoints.map((point) =>
      createDirectionalDetectionLog(nextPlayer, point, "explosion")
    ),
    ...boulderStep.landingPoints.map((point) =>
      createDirectionalDetectionLog(nextPlayer, point, "falling rocks")
    ),
  ]
  const kelpMessage = cutKelp ? createLogMessage("You cut kelps.") : null
  const latestDetectionMessage = detectionLogs.at(-1) ?? null
  const capsuleMessage = capsuleRetrievedThisTurn
    ? createLogMessage("Capsule retrieved. Return to dock.", "positive")
    : null

  const nextMessage = playerDestroyed
    ? hostileMessage ??
      createLogMessage("Your submarine is destroyed. Press R for a new run.", "negative")
    : won
    ? createLogMessage("Capsule delivered to dock. Press R for a new run.", "positive")
    : capsuleMessage !== null
    ? capsuleMessage
    : pickupStep.message !== null
    ? pickupStep.message
    : rammedFishCount > 0
    ? createLogMessage(
      rammedFishCount === 1
        ? "You paste a fish against the bow."
        : i18n._("You paste {rammedFishCount} fish against the bow.", { rammedFishCount }),
    )
    : kelpMessage !== null
    ? kelpMessage
    : latestDetectionMessage !== null
    ? latestDetectionMessage
    : impactMessage !== null
    ? impactMessage
    : hostileSonarMessage !== null
    ? hostileSonarMessage
    : fallbackMessage
  const nextMessageText = typeof nextMessage === "string" ? nextMessage : nextMessage.message
  const detectionHistoryLogs = nextMessage === latestDetectionMessage
    ? detectionLogs.slice(0, -1)
    : detectionLogs
  const nextLogs = [
    ...game.logs,
    ...hostileAiLogs,
    ...(kelpMessage !== null && nextMessage !== kelpMessage ? [kelpMessage] : []),
    ...detectionHistoryLogs,
    ...(hostileSonarMessage !== null && nextMessage !== hostileSonarMessage
      ? [hostileSonarMessage]
      : []),
    ...(won ? [createLogMessage(WIN_SEED_MODE_HINT)] : []),
  ].slice(-MAX_LOG_MESSAGES)

  const nextStatus: GameStatus = playerDestroyed ? "lost" : won ? "won" : "playing"
  const nextGame: GameState = {
        ...game,
        map,
        player: { ...nextPlayer },
        turn: nextTurn,
        status: nextStatus,
        playerSonarEnabled,
        capsuleCollected,
        lastSonarTurn: shouldEmitSonar ? nextTurn : game.lastSonarTurn,
        playerSonarContactCueCount: playerSonarMadeContact
          ? (game.playerSonarContactCueCount ?? 0) + 1
          : (game.playerSonarContactCueCount ?? 0),
        playerSonarContactAudioVariant,
        hostileSonarContactCueCount: hostileSonarContact.reveals.length > 0
          ? (game.hostileSonarContactCueCount ?? 0) + 1
          : (game.hostileSonarContactCueCount ?? 0),
        playerEntityHitCueCount: playerEntityHitThisTurn
          ? (game.playerEntityHitCueCount ?? 0) + 1
          : (game.playerEntityHitCueCount ?? 0),
        playerDeathCueCount: playerDiedThisTurn
          ? (game.playerDeathCueCount ?? 0) + 1
          : (game.playerDeathCueCount ?? 0),
        playerPickupCueCount: playerCollectedPickup
          ? (game.playerPickupCueCount ?? 0) + 1
          : (game.playerPickupCueCount ?? 0),
        logs: nextLogs,
        shockwaves: shockwaveStep.waves,
        shockwaveFront: shockwaveStep.front,
        torpedoes,
        depthCharges,
        pickups,
        fish,
        trails,
        dust,
        cracks,
        structuralDamage,
        fallingBoulders,
        hostileSubmarines,
        facing,
        torpedoAmmo,
        depthChargeAmmo,
        screenShake,
        message: nextMessageText,
      }

  return withGameMessage(
    refreshPerception(
      playerDestroyed || won ? revealMap(nextGame) : nextGame,
      [...shockwaveStep.revealedTiles, ...pickupStep.tileReveals],
      [...shockwaveStep.revealedEntities, ...hostileSonarContact.reveals],
    ),
    nextMessage,
  )
}

function collectHostileSonarContacts(
  map: GameState["map"],
  hostileSubmarines: GameState["hostileSubmarines"],
  activeShockwaves: Shockwave[],
  spawnedShockwaves: Shockwave[],
  dust: GameState["dust"],
  trails: GameState["trails"],
  revealableEntities: RevealableEntity[],
  player: Point,
): { reveals: EntityReveal[]; direction: string | null } {
  const hostileIds = new Set(hostileSubmarines.map((hostileSubmarine) => hostileSubmarine.id))
  const hostileWaves = [
    ...activeShockwaves
      .filter((wave) => hostileIds.has(wave.senderId) && wave.damaging === false)
      .map((wave) => ({ wave, spawnedThisTurn: false })),
    ...spawnedShockwaves
      .filter((wave) => hostileIds.has(wave.senderId) && wave.damaging === false)
      .map((wave) => ({ wave, spawnedThisTurn: true })),
  ]

  const reveals = new Map<number, EntityReveal>()
  let direction: string | null = null

  for (const { wave, spawnedThisTurn } of hostileWaves) {
    if (!didShockwaveReachPointThisTurn(
      map,
      wave,
      dust,
      trails,
      revealableEntities,
      player,
      spawnedThisTurn,
    )) {
      continue
    }

    if (chebyshevDistance(player, wave.origin) <= PASSIVE_EXACT_RADIUS) {
      if (direction === null) {
        direction = describeHostileBearing(player, wave.origin)
      }
      continue
    }

    const approximatePoint = createApproximateHostileSonarPoint(map, wave.origin)
    const index = indexForPoint(map.width, approximatePoint)
    reveals.set(index, {
      index,
      kind: "enemy",
      sourceSenderId: wave.senderId,
    })

    if (direction === null) {
      direction = describeHostileBearing(player, wave.origin)
    }
  }

  return {
    reveals: Array.from(reveals.values()),
    direction,
  }
}

function createApproximateHostileSonarPoint(
  map: GameState["map"],
  origin: Point,
): Point {
  const candidates: Point[] = []

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy))

      if (distance < 1 || distance > 2) {
        continue
      }

      const candidate = {
        x: origin.x + dx,
        y: origin.y + dy,
      }
      const tile = tileAt(map, candidate.x, candidate.y)

      if (tile && isPassableTile(tile)) {
        candidates.push(candidate)
      }
    }
  }

  if (candidates.length === 0) {
    return { ...origin }
  }

  return { ...candidates[randomIntegerBetween(0, candidates.length - 1)] }
}

function describeHostileBearing(player: Point, origin: Point): string {
  const deltaX = origin.x - player.x
  const deltaY = origin.y - player.y

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX < 0 ? "←" : "→"
  }

  return deltaY < 0 ? "↑" : "↓"
}

function createDirectionalDetectionLog(
  player: Point,
  origin: Point,
  kind: "explosion" | "falling rocks",
): LogMessage {
  const intensity = describeDetectionIntensity(player, origin)
  const direction = describeDetectionBearing(player, origin)

  return createLogMessage(
    `${intensity} ${kind} detected at ${direction}`,
    "warning",
  )
}

function describeDetectionIntensity(player: Point, origin: Point): string {
  const distance = chebyshevDistance(player, origin)

  if (distance >= 30) {
    return "faint"
  }

  if (distance >= 20) {
    return "small"
  }

  if (distance >= 10) {
    return "nearby"
  }

  return "loud"
}

function describeDetectionBearing(player: Point, origin: Point): string {
  const deltaX = origin.x - player.x
  const deltaY = origin.y - player.y

  if (deltaX === 0 && deltaY === 0) {
    return "•"
  }

  if (deltaX === 0) {
    return deltaY < 0 ? "↑" : "↓"
  }

  if (deltaY === 0) {
    return deltaX < 0 ? "←" : "→"
  }

  if (deltaX < 0 && deltaY < 0) {
    return "↖"
  }

  if (deltaX > 0 && deltaY < 0) {
    return "↗"
  }

  if (deltaX < 0 && deltaY > 0) {
    return "↙"
  }

  return "↘"
}

function createSonarShockwave(origin: Point): Shockwave {
  return {
    origin: { ...origin },
    radius: 0,
    senderId: "player",
    damaging: false,
    revealTerrain: true,
    revealEntities: true,
  }
}

function resolvePlayerSonarContactAudioVariant(
  width: number,
  preHostileReveals: EntityReveal[],
  preHostileFish: Fish[] | undefined,
  preHostileHostiles: HostileSubmarine[],
  postHostileReveals: EntityReveal[],
  postHostileFish: Fish[] | undefined,
  postHostileHostiles: HostileSubmarine[],
): SonarContactAudioVariant {
  return resolvePlayerSonarContactAudioVariantForPhase(
    width,
    preHostileReveals,
    preHostileFish,
    stationaryHostileIndexesById(preHostileHostiles, postHostileHostiles, width, false),
  ) ?? resolvePlayerSonarContactAudioVariantForPhase(
    width,
    postHostileReveals,
    postHostileFish,
    stationaryHostileIndexesById(preHostileHostiles, postHostileHostiles, width, true),
  ) ?? "kizilsungur"
}

function resolvePlayerSonarContactAudioVariantForPhase(
  width: number,
  reveals: EntityReveal[],
  fish: Fish[] | undefined,
  stationaryHostileIndexes: ReadonlySet<number>,
): SonarContactAudioVariant | null {
  const playerContactReveals = reveals.filter((reveal) =>
    reveal.sourceSenderId === "player" && reveal.kind !== "player"
  )

  if (playerContactReveals.length === 0) {
    return null
  }

  const fishIndexes = new Set((fish ?? []).map((candidate) =>
    indexForPoint(width, candidate.position)
  ))
  const hasDigitalContact = playerContactReveals.some((reveal) => {
    if (reveal.kind === "capsule" || reveal.kind === "item") {
      return true
    }

    if (reveal.kind === "non-hostile") {
      return true
    }

    return reveal.kind === "enemy" &&
      (fishIndexes.has(reveal.index) || stationaryHostileIndexes.has(reveal.index))
  })

  return hasDigitalContact ? "digital" : "kizilsungur"
}

function stationaryHostileIndexesById(
  preHostileHostiles: HostileSubmarine[],
  postHostileHostiles: HostileSubmarine[],
  width: number,
  usePostHostileIndexes: boolean,
): Set<number> {
  const postHostileById = new Map(postHostileHostiles.map((hostileSubmarine) => [
    hostileSubmarine.id,
    hostileSubmarine,
  ]))

  return new Set(
    preHostileHostiles
      .flatMap((hostileSubmarine) => {
        const resolvedHostile = postHostileById.get(hostileSubmarine.id)

        if (
          resolvedHostile === undefined ||
          !pointsEqual(hostileSubmarine.position, resolvedHostile.position)
        ) {
          return []
        }

        const position = usePostHostileIndexes
          ? resolvedHostile.position
          : hostileSubmarine.position

        return [indexForPoint(width, position)]
      }),
  )
}

function collectRevealableEntities(
  player: Point,
  capsule: Point,
  capsuleCollected: boolean,
  torpedoes: GameState["torpedoes"],
  depthCharges: GameState["depthCharges"],
  pickups: GameState["pickups"],
  fallingBoulders: GameState["fallingBoulders"],
  fish: GameState["fish"],
  hostileSubmarines: GameState["hostileSubmarines"],
): RevealableEntity[] {
  return [
    { kind: "player", position: { ...player } },
    ...(capsuleCollected
      ? []
      : [{ kind: "capsule" as const, position: { ...capsule } }]),
    ...torpedoes.map((torpedo) => ({
      kind: "torpedo" as const,
      position: { ...torpedo.position },
    })),
    ...depthCharges.map((depthCharge) => ({
      kind: "depth-charge" as const,
      position: { ...depthCharge.position },
    })),
    ...pickups.map((pickup) => ({
      kind: "item" as const,
      position: { ...pickup.position },
    })),
    ...fallingBoulders.map((boulder) => ({
      kind: "boulder" as const,
      position: { ...boulder.position },
    })),
    ...(fish ?? []).map((candidate) => ({
      kind: "fish" as const,
      position: { ...candidate.position },
    })),
    ...hostileSubmarines.map((hostileSubmarine) => ({
      kind: "hostile-submarine" as const,
      position: { ...hostileSubmarine.position },
    })),
  ]
}
