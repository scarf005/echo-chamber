import {
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
import {
  decayCells,
  decayCracks,
  decayShake,
  decayTrailCells,
  mergeTrailCell,
  resolveImpactMessage,
} from "./effects.ts"
import {
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
import { withGameMessage } from "./log.ts"
import { collectPickups } from "./items.ts"
import type {
  Fish,
  GameState,
  HorizontalDirection,
  RevealableEntity,
  Shockwave,
  TurnAction,
} from "./model.ts"
import { refreshPerception } from "./perception.ts"
import type { Point } from "./mapgen.ts"
import { stepFallingBoulders } from "./systems/boulders.ts"
import { stepFish } from "./systems/fish.ts"
import { stepHostileSubmarines } from "./systems/hostiles.ts"
import { stepDepthCharges, stepTorpedoes } from "./systems/projectiles.ts"
import {
  previewShockwaveEntityReveals,
  stepShockwaves,
} from "./systems/shockwaves.ts"

export function advanceTurn(
  game: GameState,
  nextPlayer: Point,
  facing: HorizontalDirection,
  action: TurnAction | null,
  fallbackMessage: string,
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
  let hostileMessage: string | null = playerDestroyed
    ? "A hostile submarine rams your hull. Press R for a new run."
    : null

  if (nextPlayer.x !== game.player.x || nextPlayer.y !== game.player.y) {
    trails = mergeTrailCell(trails, indexForPoint(map.width, game.player), 1)
  }

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
  dust = torpedoStep.dust
  fish = torpedoStep.fish
  hostileSubmarines = torpedoStep.hostileSubmarines
  fallingBoulders = [...fallingBoulders, ...torpedoStep.fallingBoulders]
  screenShake = Math.max(screenShake, torpedoStep.screenShake)
  playerDestroyed = playerDestroyed || torpedoStep.playerDestroyed

  if (torpedoStep.playerDestroyed) {
    hostileMessage =
      "A hostile torpedo tears through your hull. Press R for a new run."
  }

  const depthChargeStep = stepDepthCharges(
    map,
    depthCharges,
    trails,
    cracks,
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
  dust = depthChargeStep.dust
  fish = depthChargeStep.fish
  hostileSubmarines = depthChargeStep.hostileSubmarines
  fallingBoulders = [...fallingBoulders, ...depthChargeStep.fallingBoulders]
  screenShake = Math.max(screenShake, depthChargeStep.screenShake)
  playerDestroyed = playerDestroyed || depthChargeStep.playerDestroyed

  if (depthChargeStep.playerDestroyed) {
    hostileMessage =
      "A hostile blast caves in your hull. Press R for a new run."
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
    hostileMessage = "Cave-in debris crushes your hull. Press R for a new run."
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
  let hostileLaunchMessage: string | null = null
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
        memory: game.memory,
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
    playerDestroyed = hostileStep.playerDestroyed

    if (hostileStep.playerDestroyed) {
      hostileMessage =
        "A hostile submarine rams your hull. Press R for a new run."
    } else if (hostileStep.launchedTorpedoes.length > 0) {
      hostileLaunchMessage = "Hostile contact. Incoming torpedo."
    }
  }

  const shockwaveStep = stepShockwaves(
    map,
    game.shockwaves,
    spawnedShockwaves,
    dust,
    trails,
    collectRevealableEntities(
      nextPlayer,
      map.capsule,
      hadCapsule || capsuleRetrievedThisTurn,
      torpedoes,
      depthCharges,
      pickups,
      fallingBoulders,
      fish,
      hostileSubmarines,
    ),
  )
  const playerSonarMadeContact = playerSonarMadePreHostileContact ||
    shockwaveStep.revealedEntities.some(
      (reveal) =>
        reveal.sourceSenderId === "player" && reveal.kind !== "player",
    )
  const playerEntityHitThisTurn = rammedFishCount > 0 ||
    torpedoStep.playerEntityHits > 0 ||
    depthChargeStep.playerEntityHits > 0
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
    boulderStep.landings,
  )
  const capsuleMessage = capsuleRetrievedThisTurn
    ? "Capsule retrieved. Return to dock."
    : null

  const nextMessage = playerDestroyed
    ? hostileMessage ??
      "Your submarine is destroyed. Press R for a new run."
    : won
    ? "Capsule delivered to dock. Press R for a new run."
    : capsuleMessage !== null
    ? capsuleMessage
    : pickupStep.message !== null
    ? pickupStep.message
    : rammedFishCount > 0
    ? rammedFishCount === 1
      ? "You paste a fish against the bow."
      : `You paste ${rammedFishCount} fish against the bow.`
    : impactMessage !== null
    ? impactMessage
    : hostileLaunchMessage !== null
    ? hostileLaunchMessage
    : fallbackMessage

  return withGameMessage(
    refreshPerception(
      {
        ...game,
        map,
        player: { ...nextPlayer },
        turn: nextTurn,
        status: playerDestroyed ? "lost" : won ? "won" : "playing",
        playerSonarEnabled,
        capsuleCollected,
        lastSonarTurn: shouldEmitSonar ? nextTurn : game.lastSonarTurn,
        playerSonarContactCueCount: playerSonarMadeContact
          ? (game.playerSonarContactCueCount ?? 0) + 1
          : (game.playerSonarContactCueCount ?? 0),
        playerEntityHitCueCount: playerEntityHitThisTurn
          ? (game.playerEntityHitCueCount ?? 0) + 1
          : (game.playerEntityHitCueCount ?? 0),
        playerPickupCueCount: playerCollectedPickup
          ? (game.playerPickupCueCount ?? 0) + 1
          : (game.playerPickupCueCount ?? 0),
        shockwaves: shockwaveStep.waves,
        shockwaveFront: shockwaveStep.front,
        torpedoes,
        depthCharges,
        pickups,
        fish,
        trails,
        dust,
        cracks,
        fallingBoulders,
        hostileSubmarines,
        facing,
        torpedoAmmo,
        depthChargeAmmo,
        screenShake,
        message: nextMessage,
      },
      [...shockwaveStep.revealedTiles, ...pickupStep.tileReveals],
      shockwaveStep.revealedEntities,
    ),
    nextMessage,
  )
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
