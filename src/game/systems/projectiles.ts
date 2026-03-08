import type {
  CrackCell,
  DepthCharge,
  FadeCell,
  FallingBoulder,
  Fish,
  HostileSubmarine,
  Shockwave,
  Torpedo,
} from "../model.ts"
import {
  PROJECTILE_PROXIMITY_RADIUS,
  TORPEDO_BLAST_RADIUS,
} from "../constants.ts"
import {
  mergeCrackCells,
  mergeFadeCell,
  mergeFadeCells,
  mergeTrailCell,
} from "../effects.ts"
import {
  chebyshevDistance,
  cloneFish,
  cloneHostileSubmarine,
  deltaForDirection,
  indexForPoint,
  isNearObstacleBelow,
  pointsEqual,
} from "../helpers.ts"
import { type GeneratedMap, type Point, tileAt } from "../mapgen.ts"
import { detonateTorpedo } from "./destruction.ts"

const EXPLOSION_DAMAGE_RADIUS = Math.max(2, TORPEDO_BLAST_RADIUS)

interface ExplosionResolution {
  impactPoint: Point
  trails: FadeCell[]
  cracks: CrackCell[]
  structuralDamage: number[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  shockwave: Shockwave
  fish: Fish[]
  hostileSubmarines: HostileSubmarine[]
  entityHits: number
  playerDestroyed: boolean
  caveIns: number
  screenShake: number
}

export function stepTorpedoes(
  map: GeneratedMap,
  torpedoes: Torpedo[],
  trails: FadeCell[],
  cracks: CrackCell[],
  structuralDamage: number[],
  dust: FadeCell[],
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
  seed: string,
  turn: number,
): {
  torpedoes: Torpedo[]
  trails: FadeCell[]
  cracks: CrackCell[]
  structuralDamage: number[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  impacts: number
  impactPoints: Point[]
  caveIns: number
  screenShake: number
  shockwaves: Shockwave[]
  fish: Fish[]
  hostileSubmarines: HostileSubmarine[]
  playerEntityHits: number
  playerDestroyed: boolean
} {
  const nextTorpedoes: Torpedo[] = []
  let nextTrails = trails
  let nextCracks = cracks
  let nextStructuralDamage = structuralDamage
  let nextDust = dust
  const nextFish = fish.map(cloneFish)
  const nextHostileSubmarines = hostileSubmarines.map(cloneHostileSubmarine)
  const fallingBoulders: FallingBoulder[] = []
  const impactPoints: Point[] = []
  const shockwaves: Shockwave[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0
  let playerEntityHits = 0
  let playerDestroyed = false

  for (const torpedo of torpedoes) {
    let current = { ...torpedo.position }
    let exploded = false

    for (let step = 0; step < torpedo.speed; step += 1) {
      const delta = deltaForDirection(torpedo.direction)
      const nextPoint = {
        x: current.x + delta.x,
        y: current.y + delta.y,
      }
      const tile = tileAt(map, nextPoint.x, nextPoint.y)

      nextTrails = mergeTrailCell(
        nextTrails,
        indexForPoint(map.width, current),
        1,
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
          nextStructuralDamage,
          nextDust,
          nextFish,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextStructuralDamage = explosion.structuralDamage
        nextDust = explosion.dust
        nextFish.splice(0, nextFish.length, ...explosion.fish)
        nextHostileSubmarines.splice(
          0,
          nextHostileSubmarines.length,
          ...explosion.hostileSubmarines,
        )
        fallingBoulders.push(...explosion.fallingBoulders)
        impactPoints.push(explosion.impactPoint)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        if (torpedo.senderId === "player") {
          playerEntityHits += explosion.entityHits
        }
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      if (
        hasProjectileTargetNearby(
          nextPoint,
          torpedo.senderId,
          torpedo.avoidFriendlyFire ?? true,
          nextFish,
          nextHostileSubmarines,
          player,
        )
      ) {
        const impactPoint = { ...nextPoint }
        const explosion = detonateProjectile(
          map,
          impactPoint,
          `${seed}:${turn}:${impactPoint.x}:${impactPoint.y}:${torpedo.direction}:${impacts}`,
          torpedo.senderId,
          nextTrails,
          nextCracks,
          nextStructuralDamage,
          nextDust,
          nextFish,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextStructuralDamage = explosion.structuralDamage
        nextDust = explosion.dust
        nextFish.splice(0, nextFish.length, ...explosion.fish)
        nextHostileSubmarines.splice(
          0,
          nextHostileSubmarines.length,
          ...explosion.hostileSubmarines,
        )
        fallingBoulders.push(...explosion.fallingBoulders)
        impactPoints.push(explosion.impactPoint)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        if (torpedo.senderId === "player") {
          playerEntityHits += explosion.entityHits
        }
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      current = nextPoint
    }

    if (!exploded) {
      nextTorpedoes.push({
        ...torpedo,
        position: current,
      })
    }
  }

  return {
    torpedoes: nextTorpedoes,
    trails: nextTrails,
    cracks: nextCracks,
    structuralDamage: nextStructuralDamage,
    dust: nextDust,
    fallingBoulders,
    impacts,
    impactPoints,
    caveIns,
    screenShake,
    shockwaves,
    fish: nextFish,
    hostileSubmarines: nextHostileSubmarines,
    playerEntityHits,
    playerDestroyed,
  }
}

export function stepDepthCharges(
  map: GeneratedMap,
  depthCharges: DepthCharge[],
  trails: FadeCell[],
  cracks: CrackCell[],
  structuralDamage: number[],
  dust: FadeCell[],
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
  seed: string,
  turn: number,
): {
  depthCharges: DepthCharge[]
  trails: FadeCell[]
  cracks: CrackCell[]
  structuralDamage: number[]
  dust: FadeCell[]
  fallingBoulders: FallingBoulder[]
  impacts: number
  impactPoints: Point[]
  caveIns: number
  screenShake: number
  shockwaves: Shockwave[]
  fish: Fish[]
  hostileSubmarines: HostileSubmarine[]
  playerEntityHits: number
  playerDestroyed: boolean
} {
  const nextDepthCharges: DepthCharge[] = []
  let nextTrails = trails
  let nextCracks = cracks
  let nextStructuralDamage = structuralDamage
  let nextDust = dust
  const nextFish = fish.map(cloneFish)
  const nextHostileSubmarines = hostileSubmarines.map(cloneHostileSubmarine)
  const fallingBoulders: FallingBoulder[] = []
  const impactPoints: Point[] = []
  const shockwaves: Shockwave[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0
  let playerEntityHits = 0
  let playerDestroyed = false

  for (const depthCharge of depthCharges) {
    let current = { ...depthCharge.position }
    let remaining = depthCharge.rangeRemaining
    let exploded = false

    for (let step = 0; step < depthCharge.speed; step += 1) {
      if (remaining <= 0) {
        break
      }

      nextTrails = mergeTrailCell(
        nextTrails,
        indexForPoint(map.width, current),
        1,
      )

      if (
        hasProjectileTargetNearby(
          current,
          depthCharge.senderId,
          depthCharge.avoidFriendlyFire ?? true,
          nextFish,
          nextHostileSubmarines,
          player,
        )
      ) {
        const explosion = detonateProjectile(
          map,
          current,
          `${seed}:${turn}:${current.x}:${current.y}:depth:${impacts}`,
          depthCharge.senderId,
          nextTrails,
          nextCracks,
          nextStructuralDamage,
          nextDust,
          nextFish,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextStructuralDamage = explosion.structuralDamage
        nextDust = explosion.dust
        nextFish.splice(0, nextFish.length, ...explosion.fish)
        nextHostileSubmarines.splice(
          0,
          nextHostileSubmarines.length,
          ...explosion.hostileSubmarines,
        )
        fallingBoulders.push(...explosion.fallingBoulders)
        impactPoints.push(explosion.impactPoint)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        if (depthCharge.senderId === "player") {
          playerEntityHits += explosion.entityHits
        }
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
          nextStructuralDamage,
          nextDust,
          nextFish,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextStructuralDamage = explosion.structuralDamage
        nextDust = explosion.dust
        nextFish.splice(0, nextFish.length, ...explosion.fish)
        nextHostileSubmarines.splice(
          0,
          nextHostileSubmarines.length,
          ...explosion.hostileSubmarines,
        )
        fallingBoulders.push(...explosion.fallingBoulders)
        impactPoints.push(explosion.impactPoint)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        if (depthCharge.senderId === "player") {
          playerEntityHits += explosion.entityHits
        }
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }

      current = nextPoint
      remaining -= 1

      if (
        hasProjectileTargetNearby(
          current,
          depthCharge.senderId,
          depthCharge.avoidFriendlyFire ?? true,
          nextFish,
          nextHostileSubmarines,
          player,
        )
      ) {
        const explosion = detonateProjectile(
          map,
          current,
          `${seed}:${turn}:${current.x}:${current.y}:depth:${impacts}`,
          depthCharge.senderId,
          nextTrails,
          nextCracks,
          nextStructuralDamage,
          nextDust,
          nextFish,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextStructuralDamage = explosion.structuralDamage
        nextDust = explosion.dust
        nextFish.splice(0, nextFish.length, ...explosion.fish)
        nextHostileSubmarines.splice(
          0,
          nextHostileSubmarines.length,
          ...explosion.hostileSubmarines,
        )
        fallingBoulders.push(...explosion.fallingBoulders)
        impactPoints.push(explosion.impactPoint)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        if (depthCharge.senderId === "player") {
          playerEntityHits += explosion.entityHits
        }
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
          nextStructuralDamage,
          nextDust,
          nextFish,
          nextHostileSubmarines,
          player,
        )

        nextTrails = explosion.trails
        nextCracks = explosion.cracks
        nextStructuralDamage = explosion.structuralDamage
        nextDust = explosion.dust
        nextFish.splice(0, nextFish.length, ...explosion.fish)
        nextHostileSubmarines.splice(
          0,
          nextHostileSubmarines.length,
          ...explosion.hostileSubmarines,
        )
        fallingBoulders.push(...explosion.fallingBoulders)
        impactPoints.push(explosion.impactPoint)
        shockwaves.push(explosion.shockwave)
        playerDestroyed = playerDestroyed || explosion.playerDestroyed
        if (depthCharge.senderId === "player") {
          playerEntityHits += explosion.entityHits
        }
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
    structuralDamage: nextStructuralDamage,
    dust: nextDust,
    fallingBoulders,
    impacts,
    impactPoints,
    caveIns,
    screenShake,
    shockwaves,
    fish: nextFish,
    hostileSubmarines: nextHostileSubmarines,
    playerEntityHits,
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
  structuralDamage: number[],
  dust: FadeCell[],
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
): ExplosionResolution {
  const explosion = detonateTorpedo(map, impactPoint, seedKey, structuralDamage)
  const nextFish = resolveFishBlastDamage(impactPoint, fish)
  const nextHostileSubmarines = resolveHostileBlastDamage(
    impactPoint,
    senderId,
    hostileSubmarines,
  )
  const nextTrails = mergeTrailCell(
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
    impactPoint: { ...impactPoint },
    trails: nextTrails,
    cracks: mergeCrackCells(cracks, explosion.cracks),
    structuralDamage: explosion.structuralDamage,
    dust: nextDust,
    fallingBoulders: explosion.fallingBoulders,
    shockwave: createExplosionShockwave(impactPoint, senderId),
    fish: nextFish,
    hostileSubmarines: nextHostileSubmarines,
    entityHits: (fish.length - nextFish.length) +
      (hostileSubmarines.length - nextHostileSubmarines.length),
    playerDestroyed: doesExplosionDestroyPlayer(impactPoint, senderId, player),
    caveIns: explosion.fallingBoulders.length,
    screenShake: explosion.screenShake,
  }
}

function hasProjectileTargetNearby(
  point: Point,
  senderId: string,
  avoidFriendlyFire: boolean,
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
): boolean {
  if (senderId === "player") {
    return hostileSubmarines.some((hostileSubmarine) =>
      chebyshevDistance(point, hostileSubmarine.position) <=
        PROJECTILE_PROXIMITY_RADIUS
    ) || fish.some((candidate) =>
      chebyshevDistance(point, candidate.position) <=
        PROJECTILE_PROXIMITY_RADIUS
    )
  }

  if (chebyshevDistance(point, player) <= PROJECTILE_PROXIMITY_RADIUS) {
    return true
  }

  if (avoidFriendlyFire) {
    return false
  }

  return hostileSubmarines.some((hostileSubmarine) =>
    hostileSubmarine.id !== senderId &&
    chebyshevDistance(point, hostileSubmarine.position) <=
      PROJECTILE_PROXIMITY_RADIUS
  )
}

function resolveHostileBlastDamage(
  impactPoint: Point,
  senderId: string,
  hostileSubmarines: HostileSubmarine[],
): HostileSubmarine[] {
  return hostileSubmarines.filter((hostileSubmarine) =>
    hostileSubmarine.id === senderId ||
    chebyshevDistance(impactPoint, hostileSubmarine.position) >
      EXPLOSION_DAMAGE_RADIUS
  )
}

function resolveFishBlastDamage(impactPoint: Point, fish: Fish[]): Fish[] {
  return fish.filter((candidate) =>
    chebyshevDistance(impactPoint, candidate.position) > EXPLOSION_DAMAGE_RADIUS
  )
}

function doesExplosionDestroyPlayer(
  impactPoint: Point,
  senderId: string,
  player: Point,
): boolean {
  return senderId !== "player" &&
    chebyshevDistance(impactPoint, player) <= EXPLOSION_DAMAGE_RADIUS
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
