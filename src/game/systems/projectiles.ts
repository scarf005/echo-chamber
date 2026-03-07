import type {
  CrackCell,
  DepthCharge,
  FadeCell,
  FallingBoulder,
  HostileSubmarine,
  Shockwave,
  Torpedo,
} from "../model.ts"
import { TORPEDO_BLAST_RADIUS } from "../constants.ts"
import { mergeCrackCells, mergeFadeCell, mergeFadeCells } from "../effects.ts"
import {
  chebyshevDistance,
  cloneHostileSubmarine,
  indexForPoint,
  isNearObstacleBelow,
  pointsEqual,
} from "../helpers.ts"
import { tileAt, type GeneratedMap, type Point } from "../mapgen.ts"
import { detonateTorpedo } from "./destruction.ts"

const PROJECTILE_PROXIMITY_RADIUS = 2
const EXPLOSION_DAMAGE_RADIUS = Math.max(2, TORPEDO_BLAST_RADIUS)

interface ExplosionResolution {
  trails: FadeCell[]
  cracks: CrackCell[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  shockwave: Shockwave
  hostileSubmarines: HostileSubmarine[]
  playerDestroyed: boolean
  caveIns: number
  screenShake: number
}

export function stepTorpedoes(
  map: GeneratedMap,
  torpedoes: Torpedo[],
  trails: FadeCell[],
  cracks: CrackCell[],
  dust: FadeCell[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
  seed: string,
  turn: number,
): {
  torpedoes: Torpedo[]
  trails: FadeCell[]
  cracks: CrackCell[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  impacts: number
  caveIns: number
  screenShake: number
  shockwaves: Shockwave[]
  hostileSubmarines: HostileSubmarine[]
  playerDestroyed: boolean
} {
  const nextTorpedoes: Torpedo[] = []
  let nextTrails = trails
  let nextCracks = cracks
  let nextDust = dust
  const nextHostileSubmarines = hostileSubmarines.map(cloneHostileSubmarine)
  const fallingBoulders: FallingBoulder[] = []
  const shockwaves: Shockwave[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0
  let playerDestroyed = false

  for (const torpedo of torpedoes) {
    let current = { ...torpedo.position }
    let remaining = torpedo.rangeRemaining
    let exploded = false

    for (let step = 0; step < torpedo.speed; step += 1) {
      if (remaining <= 0) {
        break
      }

      const nextPoint = {
        x: current.x + (torpedo.direction === "left" ? -1 : 1),
        y: current.y,
      }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      nextTrails = mergeFadeCell(
        nextTrails,
        indexForPoint(map.width, current),
        0.82,
      )

      if (!tile || tile === "wall") {
        const impactPoint = tile ? nextPoint : current
        const explosion = detonateProjectile(
          map,
          impactPoint,
          `${seed}:${turn}:${impactPoint.x}:${impactPoint.y}:${torpedo.direction}:${impacts}`,
          torpedo.senderId,
          nextTrails,
          nextCracks,
          nextDust,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextDust = explosion.dust
        nextHostileSubmarines.splice(0, nextHostileSubmarines.length, ...explosion.hostileSubmarines)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      if (hasHostileTargetNearby(nextPoint, torpedo.senderId, nextHostileSubmarines, player)) {
        const impactPoint = { ...nextPoint }
        const explosion = detonateProjectile(
          map,
          impactPoint,
          `${seed}:${turn}:${impactPoint.x}:${impactPoint.y}:${torpedo.direction}:${impacts}`,
          torpedo.senderId,
          nextTrails,
          nextCracks,
          nextDust,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextDust = explosion.dust
        nextHostileSubmarines.splice(0, nextHostileSubmarines.length, ...explosion.hostileSubmarines)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      current = nextPoint
      remaining -= 1
    }

    if (!exploded && remaining > 0) {
      nextTorpedoes.push({
        ...torpedo,
        position: current,
        rangeRemaining: remaining,
      })
    }
  }

  return {
    torpedoes: nextTorpedoes,
    trails: nextTrails,
    cracks: nextCracks,
    dust: nextDust,
    fallingBoulders,
    impacts,
    caveIns,
    screenShake,
    shockwaves,
    hostileSubmarines: nextHostileSubmarines,
    playerDestroyed,
  }
}

export function stepDepthCharges(
  map: GeneratedMap,
  depthCharges: DepthCharge[],
  trails: FadeCell[],
  cracks: CrackCell[],
  dust: FadeCell[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
  seed: string,
  turn: number,
): {
  depthCharges: DepthCharge[]
  trails: FadeCell[]
  cracks: CrackCell[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  impacts: number
  caveIns: number
  screenShake: number
  shockwaves: Shockwave[]
  hostileSubmarines: HostileSubmarine[]
  playerDestroyed: boolean
} {
  const nextDepthCharges: DepthCharge[] = []
  let nextTrails = trails
  let nextCracks = cracks
  let nextDust = dust
  const nextHostileSubmarines = hostileSubmarines.map(cloneHostileSubmarine)
  const fallingBoulders: FallingBoulder[] = []
  const shockwaves: Shockwave[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0
  let playerDestroyed = false

  for (const depthCharge of depthCharges) {
    let current = { ...depthCharge.position }
    let remaining = depthCharge.rangeRemaining
    let exploded = false

    for (let step = 0; step < depthCharge.speed; step += 1) {
      if (remaining <= 0) {
        break
      }

      nextTrails = mergeFadeCell(
        nextTrails,
        indexForPoint(map.width, current),
        0.76,
      )

      if (hasHostileTargetNearby(current, depthCharge.senderId, nextHostileSubmarines, player)) {
        const explosion = detonateProjectile(
          map,
          current,
          `${seed}:${turn}:${current.x}:${current.y}:depth:${impacts}`,
          depthCharge.senderId,
          nextTrails,
          nextCracks,
          nextDust,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextDust = explosion.dust
        nextHostileSubmarines.splice(0, nextHostileSubmarines.length, ...explosion.hostileSubmarines)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      const nextPoint = {
        x: current.x,
        y: current.y + 1,
      }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      if (!tile || tile === "wall") {
        const impactPoint = current
        const explosion = detonateProjectile(
          map,
          impactPoint,
          `${seed}:${turn}:${impactPoint.x}:${impactPoint.y}:depth:${impacts}`,
          depthCharge.senderId,
          nextTrails,
          nextCracks,
          nextDust,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextDust = explosion.dust
        nextHostileSubmarines.splice(0, nextHostileSubmarines.length, ...explosion.hostileSubmarines)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      current = nextPoint
      remaining -= 1

      if (hasHostileTargetNearby(current, depthCharge.senderId, nextHostileSubmarines, player)) {
        const explosion = detonateProjectile(
          map,
          current,
          `${seed}:${turn}:${current.x}:${current.y}:depth:${impacts}`,
          depthCharge.senderId,
          nextTrails,
          nextCracks,
          nextDust,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextDust = explosion.dust
        nextHostileSubmarines.splice(0, nextHostileSubmarines.length, ...explosion.hostileSubmarines)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      if (isNearObstacleBelow(map, current)) {
        const explosion = detonateProjectile(
          map,
          current,
          `${seed}:${turn}:${current.x}:${current.y}:depth:${impacts}`,
          depthCharge.senderId,
          nextTrails,
          nextCracks,
          nextDust,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextDust = explosion.dust
        nextHostileSubmarines.splice(0, nextHostileSubmarines.length, ...explosion.hostileSubmarines)
        fallingBoulders.push(...explosion.fallingBoulders)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }
    }

    if (!exploded && remaining > 0) {
      nextDepthCharges.push({
        ...depthCharge,
        position: current,
        rangeRemaining: remaining,
      })
    }
  }

  return {
    depthCharges: nextDepthCharges,
    trails: nextTrails,
    cracks: nextCracks,
    dust: nextDust,
    fallingBoulders,
    impacts,
    caveIns,
    screenShake,
    shockwaves,
    hostileSubmarines: nextHostileSubmarines,
    playerDestroyed,
  }
}

function detonateProjectile(
  map: GeneratedMap,
  impactPoint: Point,
  seedKey: string,
  senderId: string,
  trails: FadeCell[],
  cracks: CrackCell[],
  dust: FadeCell[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
): ExplosionResolution {
  const explosion = detonateTorpedo(map, impactPoint, seedKey)
  const nextTrails = mergeFadeCell(
    trails,
    indexForPoint(map.width, impactPoint),
    1,
  )
  let nextDust = mergeFadeCell(
    dust,
    indexForPoint(map.width, impactPoint),
    0.7,
  )

  nextDust = mergeFadeCells(nextDust, explosion.dust)

  return {
    trails: nextTrails,
    cracks: mergeCrackCells(cracks, explosion.cracks),
    dust: nextDust,
    fallingBoulders: explosion.fallingBoulders,
    shockwave: createExplosionShockwave(impactPoint, senderId),
    hostileSubmarines: resolveHostileBlastDamage(impactPoint, senderId, hostileSubmarines),
    playerDestroyed: doesExplosionDestroyPlayer(impactPoint, senderId, player),
    caveIns: explosion.fallingBoulders.length,
    screenShake: explosion.screenShake,
  }
}

function hasHostileTargetNearby(
  point: Point,
  senderId: string,
  hostileSubmarines: HostileSubmarine[],
  player: Point,
): boolean {
  if (senderId === "player") {
    return hostileSubmarines.some((hostileSubmarine) =>
      chebyshevDistance(point, hostileSubmarine.position) <= PROJECTILE_PROXIMITY_RADIUS
    )
  }

  return chebyshevDistance(point, player) <= PROJECTILE_PROXIMITY_RADIUS
}

function resolveHostileBlastDamage(
  impactPoint: Point,
  senderId: string,
  hostileSubmarines: HostileSubmarine[],
): HostileSubmarine[] {
  if (senderId !== "player") {
    return hostileSubmarines
  }

  return hostileSubmarines.filter((hostileSubmarine) =>
    chebyshevDistance(impactPoint, hostileSubmarine.position) > EXPLOSION_DAMAGE_RADIUS
  )
}

function doesExplosionDestroyPlayer(impactPoint: Point, senderId: string, player: Point): boolean {
  return senderId !== "player" && chebyshevDistance(impactPoint, player) <= EXPLOSION_DAMAGE_RADIUS
}

function createExplosionShockwave(origin: Point, senderId: string): Shockwave {
  return {
    origin: { ...origin },
    radius: 0,
    senderId,
    damaging: true,
    revealTerrain: false,
    revealEntities: false,
  }
}
