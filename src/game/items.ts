import { i18n } from "../i18n.ts"
import { createLogMessage, resolveLogMessageText } from "./log.ts"
import {
  ITEM_AMMO_BUNDLE,
  MAP_REVEAL_RADIUS,
  MAX_DEPTH_CHARGES,
  MAX_TORPEDOES,
  PASSIVE_DETECTED_RADIUS,
} from "./constants.ts"
import {
  chebyshevDistance,
  createDeterministicRandom,
  randomChoice,
  shufflePoints,
} from "./helpers.ts"
import type { GameState, LogMessage, PickupItem, PickupKind, TileReveal } from "./model.ts"
import { tileAt, type GeneratedMap, type Point } from "./mapgen.ts"
import { randomIntegerBetween } from "@std/random"

const PICKUP_KINDS: PickupKind[] = ["torpedo-cache", "depth-charge-cache", "map"]
const MIN_PICKUP_ANCHOR_DISTANCE = 5
const MIN_PICKUP_SPACING = 6

export function createCornerPickups(map: GeneratedMap, seed: string): PickupItem[] {
  const random = createDeterministicRandom(`${seed}:corner-pickups`)
  const candidates = shufflePoints(findCornerCandidates(map), random)
    .filter((point) => {
      const spawnDistance = chebyshevDistance(point, map.spawn)
      const capsuleDistance = chebyshevDistance(point, map.capsule)

      return spawnDistance >= MIN_PICKUP_ANCHOR_DISTANCE &&
        capsuleDistance >= MIN_PICKUP_ANCHOR_DISTANCE
    })

  const spaced: Point[] = []

  for (const candidate of candidates) {
    if (spaced.some((point) => chebyshevDistance(point, candidate) < MIN_PICKUP_SPACING)) {
      continue
    }

    spaced.push(candidate)
  }

  const pickupCount = Math.min(
    spaced.length,
    Math.max(1, Math.min(4, Math.floor(map.width * map.height / 2400) + 1)),
  )

  return spaced.slice(0, pickupCount).map((position) => ({
    position,
    kind: randomChoice(PICKUP_KINDS, random),
  }))
}

export function collectPickups(
  game: GameState,
  player: Point,
  pickups: PickupItem[],
): {
  pickups: PickupItem[]
  torpedoAmmo: number
  depthChargeAmmo: number
  tileReveals: TileReveal[]
  message: LogMessage | null
} {
  const collected = pickups.filter((pickup) => isSamePoint(pickup.position, player))

  if (collected.length === 0) {
    return {
      pickups,
      torpedoAmmo: game.torpedoAmmo,
      depthChargeAmmo: game.depthChargeAmmo,
      tileReveals: [],
      message: null,
    }
  }

  let torpedoAmmo = game.torpedoAmmo
  let depthChargeAmmo = game.depthChargeAmmo
  let tileReveals: TileReveal[] = []
  const messages: LogMessage[] = []

  for (const pickup of collected) {
    if (pickup.kind === "torpedo-cache") {
      const nextAmmo = Math.min(MAX_TORPEDOES, torpedoAmmo + ITEM_AMMO_BUNDLE)
      const recovered = nextAmmo - torpedoAmmo
      torpedoAmmo = nextAmmo
      messages.push(
        recovered > 0
          ? createLogMessage(
            i18n._("Recovered {recovered} torpedoes.", { recovered }),
            "neutral",
            () => i18n._("Recovered {recovered} torpedoes.", { recovered }),
          )
          : createLogMessage(i18n._("Torpedo tubes already full."), "neutral", () => i18n._("Torpedo tubes already full.")),
      )
      continue
    }

    if (pickup.kind === "depth-charge-cache") {
      const nextAmmo = Math.min(MAX_DEPTH_CHARGES, depthChargeAmmo + ITEM_AMMO_BUNDLE)
      const recovered = nextAmmo - depthChargeAmmo
      depthChargeAmmo = nextAmmo
      messages.push(
        recovered > 0
          ? createLogMessage(
            i18n._("Recovered {recovered} depth charges.", { recovered }),
            "neutral",
            () => i18n._("Recovered {recovered} depth charges.", { recovered }),
          )
          : createLogMessage(i18n._("Depth charge racks already full."), "neutral", () => i18n._("Depth charge racks already full.")),
      )
      continue
    }

    tileReveals = mergeTileReveals(tileReveals, createMapReveal(game, pickup.position))
    messages.push(createLogMessage(i18n._("Recovered a survey map."), "neutral", () => i18n._("Recovered a survey map.")))
  }

  return {
    pickups: pickups.filter((pickup) => !isSamePoint(pickup.position, player)),
    torpedoAmmo,
    depthChargeAmmo,
    tileReveals,
    message: messages.length === 1
      ? messages[0]
      : createLogMessage(
        messages.map((entry) => resolveLogMessageText(entry)).join(" "),
        "neutral",
        () => messages.map((entry) => resolveLogMessageText(entry)).join(" "),
      ),
  }
}

function createMapReveal(game: GameState, pickupPosition: Point): TileReveal[] {
  const random = createDeterministicRandom(
    `${game.seed}:map:${game.turn}:${pickupPosition.x}:${pickupPosition.y}`,
  )
  const hiddenCandidates: Point[] = []
  const distantCandidates: Point[] = []

  for (let y = 1; y < game.map.height - 1; y += 1) {
    for (let x = 1; x < game.map.width - 1; x += 1) {
      const index = y * game.map.width + x

      if (game.memory[index] !== null) {
        continue
      }

      const point = { x, y }
      hiddenCandidates.push(point)

      if (chebyshevDistance(point, game.player) > PASSIVE_DETECTED_RADIUS) {
        distantCandidates.push(point)
      }
    }
  }

  const candidates = distantCandidates.length > 0 ? distantCandidates : hiddenCandidates
  const center = candidates.length > 0 ? randomChoice(candidates, random) : { ...pickupPosition }
  const reveals: TileReveal[] = []

  for (let y = center.y - MAP_REVEAL_RADIUS; y <= center.y + MAP_REVEAL_RADIUS; y += 1) {
    for (let x = center.x - MAP_REVEAL_RADIUS; x <= center.x + MAP_REVEAL_RADIUS; x += 1) {
      if (x <= 0 || x >= game.map.width - 1 || y <= 0 || y >= game.map.height - 1) {
        continue
      }

      if (chebyshevDistance(center, { x, y }) > MAP_REVEAL_RADIUS) {
        continue
      }

      const tile = tileAt(game.map, x, y)

      if (!tile) {
        continue
      }

      reveals.push({ index: y * game.map.width + x, tile })
    }
  }

  return reveals
}

function findCornerCandidates(map: GeneratedMap): Point[] {
  const candidates: Point[] = []

  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      if (tileAt(map, x, y) !== "water") {
        continue
      }

      const up = tileAt(map, x, y - 1)
      const right = tileAt(map, x + 1, y)
      const down = tileAt(map, x, y + 1)
      const left = tileAt(map, x - 1, y)
      const cornerPairs = [
        up === "wall" && left === "wall" && right === "water" && down === "water",
        up === "wall" && right === "wall" && left === "water" && down === "water",
        right === "wall" && down === "wall" && up === "water" && left === "water",
        down === "wall" && left === "wall" && up === "water" && right === "water",
      ]

      if (cornerPairs.some(Boolean)) {
        candidates.push({ x, y })
      }
    }
  }

  return candidates
}

function mergeTileReveals(current: TileReveal[], next: TileReveal[]): TileReveal[] {
  const merged = new Map<number, TileReveal>()

  for (const reveal of [...current, ...next]) {
    merged.set(reveal.index, reveal)
  }

  return Array.from(merged.values())
}

function isSamePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}
