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
  cloneDepthCharge,
  cloneFish,
  cloneHostileSubmarine,
  cloneTorpedo,
  deltaForDirection,
  indexForPoint,
} from "../helpers.ts"
import { type GeneratedMap, type Point, tileAt } from "../mapgen.ts"
import { detonateTorpedo } from "./destruction.ts"

const EXPLOSION_DAMAGE_RADIUS = Math.max(2, TORPEDO_BLAST_RADIUS)

const projectileTrailSource = (
  senderId: string,
): "player-projectile" | "enemy-projectile" => {
  return senderId === "player" ? "player-projectile" : "enemy-projectile"
}

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
  hostileKills: number
  playerDestroyed: boolean
  caveIns: number
  screenShake: number
}

const orderProjectilesByPrecedence = <Projectile extends { senderId: string }>(
  projectiles: Projectile[],
): Projectile[] => {
  const playerProjectiles = projectiles.filter((projectile) =>
    projectile.senderId === "player"
  )
  const hostileProjectiles = projectiles.filter((projectile) =>
    projectile.senderId !== "player"
  )

  return [...playerProjectiles, ...hostileProjectiles]
}

const hasActiveProjectileSender = (
  senderId: string,
  hostileSubmarines: HostileSubmarine[],
): boolean => {
  return senderId === "player" ||
    hostileSubmarines.some((hostileSubmarine) =>
      hostileSubmarine.id === senderId
    )
}

export const stepTorpedoes = (
  map: GeneratedMap,
  torpedoes: Torpedo[],
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
  torpedoes: Torpedo[]
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
  playerHostileKills: number
  playerDestroyed: boolean
} => {
  let nextTrails = trails
  let nextCracks = cracks
  let nextStructuralDamage = structuralDamage
  let nextDust = dust
  const orderedTorpedoes = orderProjectilesByPrecedence(torpedoes).map(
    cloneTorpedo,
  )
  let activeTorpedoes = orderedTorpedoes
  let activeDepthCharges = depthCharges.map(cloneDepthCharge)
  const nextFish = fish.map(cloneFish)
  const nextHostileSubmarines = hostileSubmarines.map(cloneHostileSubmarine)
  const fallingBoulders: FallingBoulder[] = []
  const impactPoints: Point[] = []
  const shockwaves: Shockwave[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0
  let playerEntityHits = 0
  let playerHostileKills = 0
  let playerDestroyed = false

  for (const torpedo of orderedTorpedoes) {
    if (!activeTorpedoes.includes(torpedo)) {
      continue
    }

    if (!hasActiveProjectileSender(torpedo.senderId, nextHostileSubmarines)) {
      activeTorpedoes = activeTorpedoes.filter((candidate) =>
        candidate !== torpedo
      )
      continue
    }

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
        undefined,
        projectileTrailSource(torpedo.senderId),
        torpedo.senderId === "player",
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
        activeTorpedoes = resolveProjectileBlastDamage(
          impactPoint,
          torpedo.senderId,
          activeTorpedoes,
          torpedo,
        )
        activeDepthCharges = resolveProjectileBlastDamage(
          impactPoint,
          torpedo.senderId,
          activeDepthCharges,
        )
        if (torpedo.senderId === "player") {
          playerEntityHits += explosion.entityHits
          playerHostileKills += explosion.hostileKills
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
          activeTorpedoes,
          activeDepthCharges,
          torpedo,
          null,
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
        activeTorpedoes = resolveProjectileBlastDamage(
          impactPoint,
          torpedo.senderId,
          activeTorpedoes,
          torpedo,
        )
        activeDepthCharges = resolveProjectileBlastDamage(
          impactPoint,
          torpedo.senderId,
          activeDepthCharges,
        )
        if (torpedo.senderId === "player") {
          playerEntityHits += explosion.entityHits
          playerHostileKills += explosion.hostileKills
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
      torpedo.position = current
    }
  }

  return {
    torpedoes: activeTorpedoes,
    depthCharges: activeDepthCharges,
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
    playerHostileKills,
    playerDestroyed,
  }
}

export const stepDepthCharges = (
  map: GeneratedMap,
  depthCharges: DepthCharge[],
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
  depthCharges: DepthCharge[]
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
  playerHostileKills: number
  playerDestroyed: boolean
} => {
  let nextTrails = trails
  let nextCracks = cracks
  let nextStructuralDamage = structuralDamage
  let nextDust = dust
  let activeTorpedoes = torpedoes.map(cloneTorpedo)
  const orderedDepthCharges = orderProjectilesByPrecedence(depthCharges).map(
    cloneDepthCharge,
  )
  let activeDepthCharges = orderedDepthCharges
  const nextFish = fish.map(cloneFish)
  const nextHostileSubmarines = hostileSubmarines.map(cloneHostileSubmarine)
  const fallingBoulders: FallingBoulder[] = []
  const impactPoints: Point[] = []
  const shockwaves: Shockwave[] = []
  let impacts = 0
  let caveIns = 0
  let screenShake = 0
  let playerEntityHits = 0
  let playerHostileKills = 0
  let playerDestroyed = false

  for (const depthCharge of orderedDepthCharges) {
    if (!activeDepthCharges.includes(depthCharge)) {
      continue
    }

    if (
      !hasActiveProjectileSender(depthCharge.senderId, nextHostileSubmarines)
    ) {
      activeDepthCharges = activeDepthCharges.filter((candidate) =>
        candidate !== depthCharge
      )
      continue
    }

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
        undefined,
        projectileTrailSource(depthCharge.senderId),
        depthCharge.senderId === "player",
      )

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
        activeTorpedoes = resolveProjectileBlastDamage(
          current,
          depthCharge.senderId,
          activeTorpedoes,
        )
        activeDepthCharges = resolveProjectileBlastDamage(
          current,
          depthCharge.senderId,
          activeDepthCharges,
          depthCharge,
        )
        if (depthCharge.senderId === "player") {
          playerEntityHits += explosion.entityHits
          playerHostileKills += explosion.hostileKills
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
          activeTorpedoes,
          activeDepthCharges,
          null,
          depthCharge,
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
        activeTorpedoes = resolveProjectileBlastDamage(
          current,
          depthCharge.senderId,
          activeTorpedoes,
        )
        activeDepthCharges = resolveProjectileBlastDamage(
          current,
          depthCharge.senderId,
          activeDepthCharges,
          depthCharge,
        )
        if (depthCharge.senderId === "player") {
          playerEntityHits += explosion.entityHits
          playerHostileKills += explosion.hostileKills
        }
        exploded = true
        impacts += 1
        caveIns += explosion.caveIns
        screenShake = Math.max(screenShake, explosion.screenShake)
        break
      }
    }

    if (!exploded && remaining > 0) {
      depthCharge.position = current
      depthCharge.rangeRemaining = remaining
    } else if (!exploded) {
      activeDepthCharges = activeDepthCharges.filter((candidate) =>
        candidate !== depthCharge
      )
    }
  }

  return {
    depthCharges: activeDepthCharges,
    torpedoes: activeTorpedoes,
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
    playerHostileKills,
    playerDestroyed,
  }
}

const detonateProjectile = (
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
): ExplosionResolution => {
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
    undefined,
    projectileTrailSource(senderId),
    senderId === "player",
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
    hostileKills: hostileSubmarines.length - nextHostileSubmarines.length,
    playerDestroyed: doesExplosionDestroyPlayer(impactPoint, senderId, player),
    caveIns: explosion.fallingBoulders.length,
    screenShake: explosion.screenShake,
  }
}

const hasProjectileTargetNearby = (
  point: Point,
  senderId: string,
  avoidFriendlyFire: boolean,
  fish: Fish[],
  hostileSubmarines: HostileSubmarine[],
  player: Point,
  torpedoes: Torpedo[],
  depthCharges: DepthCharge[],
  ignoredTorpedo: Torpedo | null,
  ignoredDepthCharge: DepthCharge | null,
): boolean => {
  if (senderId === "player") {
    return hostileSubmarines.some((hostileSubmarine) =>
      chebyshevDistance(point, hostileSubmarine.position) <=
        PROJECTILE_PROXIMITY_RADIUS
    ) || fish.some((candidate) =>
      chebyshevDistance(point, candidate.position) <=
        PROJECTILE_PROXIMITY_RADIUS
    ) || hasHostileProjectileNearby(
      point,
      senderId,
      avoidFriendlyFire,
      torpedoes,
      ignoredTorpedo,
    ) || hasHostileProjectileNearby(
      point,
      senderId,
      avoidFriendlyFire,
      depthCharges,
      ignoredDepthCharge,
    )
  }

  if (chebyshevDistance(point, player) <= PROJECTILE_PROXIMITY_RADIUS) {
    return true
  }

  if (
    hasHostileProjectileNearby(
      point,
      senderId,
      avoidFriendlyFire,
      torpedoes,
      ignoredTorpedo,
    ) ||
    hasHostileProjectileNearby(
      point,
      senderId,
      avoidFriendlyFire,
      depthCharges,
      ignoredDepthCharge,
    )
  ) {
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

const hasHostileProjectileNearby = <
  Projectile extends {
    senderId: string
    position: Point
  },
>(
  point: Point,
  senderId: string,
  avoidFriendlyFire: boolean,
  projectiles: Projectile[],
  ignoredProjectile: Projectile | null,
): boolean => {
  return projectiles.some((projectile) => {
    if (projectile === ignoredProjectile) {
      return false
    }

    return isProjectileHostile(
      senderId,
      projectile.senderId,
      avoidFriendlyFire,
    ) &&
      chebyshevDistance(point, projectile.position) <=
        PROJECTILE_PROXIMITY_RADIUS
  })
}

const isProjectileHostile = (
  senderId: string,
  projectileSenderId: string,
  avoidFriendlyFire: boolean,
): boolean => {
  if (projectileSenderId === senderId) {
    return false
  }

  if (senderId === "player") {
    return projectileSenderId !== "player"
  }

  if (projectileSenderId === "player") {
    return true
  }

  return avoidFriendlyFire === false
}

const resolveProjectileBlastDamage = <
  Projectile extends {
    senderId: string
    position: Point
  },
>(
  impactPoint: Point,
  senderId: string,
  projectiles: Projectile[],
  ignoredProjectile?: Projectile,
): Projectile[] => {
  return projectiles.filter((projectile) =>
    projectile !== ignoredProjectile &&
    (projectile.senderId === senderId ||
      chebyshevDistance(impactPoint, projectile.position) >
        EXPLOSION_DAMAGE_RADIUS)
  )
}

const resolveHostileBlastDamage = (
  impactPoint: Point,
  senderId: string,
  hostileSubmarines: HostileSubmarine[],
): HostileSubmarine[] => {
  return hostileSubmarines.filter((hostileSubmarine) =>
    hostileSubmarine.id === senderId ||
    chebyshevDistance(impactPoint, hostileSubmarine.position) >
      EXPLOSION_DAMAGE_RADIUS
  )
}

const resolveFishBlastDamage = (impactPoint: Point, fish: Fish[]): Fish[] => {
  return fish.filter((candidate) =>
    chebyshevDistance(impactPoint, candidate.position) > EXPLOSION_DAMAGE_RADIUS
  )
}

const doesExplosionDestroyPlayer = (
  impactPoint: Point,
  senderId: string,
  player: Point,
): boolean => {
  return senderId !== "player" &&
    chebyshevDistance(impactPoint, player) <= EXPLOSION_DAMAGE_RADIUS
}

const createExplosionShockwave = (
  origin: Point,
  senderId: string,
): Shockwave => {
  return {
    origin: { ...origin },
    radius: 0,
    senderId,
    damaging: true,
    revealTerrain: false,
    revealEntities: false,
  }
}
