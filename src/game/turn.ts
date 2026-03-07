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
import { decayCells, decayCracks, decayShake, resolveImpactMessage } from "./effects.ts"
import { cloneBoulder, cloneDepthCharge, cloneMap, cloneTorpedo } from "./helpers.ts"
import type {
  GameState,
  HorizontalDirection,
  RevealableEntity,
  Shockwave,
  TurnAction,
} from "./model.ts"
import { refreshPerception } from "./perception.ts"
import { stepFallingBoulders } from "./systems/boulders.ts"
import { stepDepthCharges, stepTorpedoes } from "./systems/projectiles.ts"
import { stepShockwaves } from "./systems/shockwaves.ts"
import type { Point } from "./mapgen.ts"

export function advanceTurn(
  game: GameState,
  nextPlayer: Point,
  facing: HorizontalDirection,
  action: TurnAction | null,
  fallbackMessage: string,
): GameState {
  const nextTurn = game.turn + 1
  const map = cloneMap(game.map)
  let torpedoes = game.torpedoes.map(cloneTorpedo)
  let depthCharges = game.depthCharges.map(cloneDepthCharge)
  let trails = decayCells(game.trails, TRAIL_DECAY)
  let dust = decayCells(game.dust, DUST_DECAY)
  let cracks = decayCracks(game.cracks, CRACK_DECAY)
  let fallingBoulders = game.fallingBoulders.map(cloneBoulder)
  let torpedoesRemaining = game.torpedoesRemaining
  let screenShake = decayShake(game.screenShake, SHAKE_DECAY)

  if (action?.kind === "torpedo") {
    torpedoes.push({
      position: { ...nextPlayer },
      senderId: "player",
      direction: action.direction,
      speed: TORPEDO_SPEED,
      rangeRemaining: TORPEDO_RANGE,
    })
    torpedoesRemaining -= 1
  }

  if (action?.kind === "depth-charge") {
    depthCharges.push({
      position: { ...nextPlayer },
      senderId: "player",
      speed: DEPTH_CHARGE_SPEED,
      rangeRemaining: DEPTH_CHARGE_RANGE,
    })
    torpedoesRemaining -= 1
  }

  const torpedoStep = stepTorpedoes(
    map,
    torpedoes,
    trails,
    cracks,
    dust,
    game.seed,
    nextTurn,
  )
  torpedoes = torpedoStep.torpedoes
  trails = torpedoStep.trails
  cracks = torpedoStep.cracks
  dust = torpedoStep.dust
  fallingBoulders = [...fallingBoulders, ...torpedoStep.fallingBoulders]
  screenShake = Math.max(screenShake, torpedoStep.screenShake)

  const depthChargeStep = stepDepthCharges(
    map,
    depthCharges,
    trails,
    cracks,
    dust,
    game.seed,
    nextTurn,
  )
  depthCharges = depthChargeStep.depthCharges
  trails = depthChargeStep.trails
  cracks = depthChargeStep.cracks
  dust = depthChargeStep.dust
  fallingBoulders = [...fallingBoulders, ...depthChargeStep.fallingBoulders]
  screenShake = Math.max(screenShake, depthChargeStep.screenShake)

  const boulderStep = stepFallingBoulders(map, fallingBoulders, dust)
  fallingBoulders = boulderStep.fallingBoulders
  dust = boulderStep.dust
  screenShake = Math.max(screenShake, boulderStep.screenShake)

  const shouldEmitSonar = nextTurn % SONAR_INTERVAL === 0
  const spawnedShockwaves: Shockwave[] = [
    ...torpedoStep.shockwaves,
    ...depthChargeStep.shockwaves,
    ...(shouldEmitSonar ? [createSonarShockwave(nextPlayer)] : []),
  ]
  const shockwaveStep = stepShockwaves(
    map,
    game.shockwaves,
    spawnedShockwaves,
    dust,
    collectRevealableEntities(map.capsule, torpedoes, depthCharges, fallingBoulders),
  )
  const won =
    nextPlayer.x === map.capsule.x && nextPlayer.y === map.capsule.y

  const impactMessage = resolveImpactMessage(
    torpedoStep.impacts,
    depthChargeStep.impacts,
    torpedoStep.caveIns,
    boulderStep.landings,
  )

  return refreshPerception(
    {
      ...game,
      map,
      player: { ...nextPlayer },
      turn: nextTurn,
      status: won ? "won" : "playing",
      lastSonarTurn: shouldEmitSonar ? nextTurn : game.lastSonarTurn,
      shockwaves: shockwaveStep.waves,
      shockwaveFront: shockwaveStep.front,
      torpedoes,
      depthCharges,
      trails,
      dust,
      cracks,
      fallingBoulders,
      facing,
      torpedoesRemaining,
      screenShake,
      message: won
        ? "Capsule secured. Press R for a new run."
        : impactMessage !== null
        ? impactMessage
        : fallbackMessage,
    },
    shockwaveStep.revealedTiles,
    shockwaveStep.revealedEntities,
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
  capsule: Point,
  torpedoes: GameState["torpedoes"],
  depthCharges: GameState["depthCharges"],
  fallingBoulders: GameState["fallingBoulders"],
): RevealableEntity[] {
  return [
    { kind: "capsule", position: { ...capsule } },
    ...torpedoes.map((torpedo) => ({ kind: "torpedo" as const, position: { ...torpedo.position } })),
    ...depthCharges.map((depthCharge) => ({ kind: "depth-charge" as const, position: { ...depthCharge.position } })),
    ...fallingBoulders.map((boulder) => ({ kind: "boulder" as const, position: { ...boulder.position } })),
  ]
}
