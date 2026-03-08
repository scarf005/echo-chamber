import { exactEntityNameAtPoint } from "../../game/entity_labels.ts"
import type { GameState, HostileSubmarine } from "../../game/game.ts"
import type { Point } from "../../game/mapgen.ts"
import { tileAt } from "../../game/mapgen.ts"

export type InspectorRow = {
  label: string
  value: string
  devOnly?: boolean
}

export function describeHoveredInspectorRows(
  game: GameState,
  point: Point | null,
): InspectorRow[] | null {
  if (!point) {
    return null
  }

  const index = point.y * game.map.width + point.x
  const hasExactEntityVisibility = hasExactInspectorVisibility(game, point)
  const rows: InspectorRow[] = [
    { label: "terrain", value: tileAt(game.map, point.x, point.y) ?? "void" },
    { label: "contact", value: describeInspectorContact(game, point) ?? "--" },
    {
      label: "visibility",
      value: String(game.visibility[index] ?? 0),
      devOnly: true,
    },
    { label: "memory", value: game.memory[index] ?? "unknown", devOnly: true },
  ]

  if (point.x === game.player.x && point.y === game.player.y) {
    rows.push({ label: "entity", value: "player submarine" })
    rows.push({ label: "facing", value: game.facing })
    rows.push({
      label: "objective load",
      value: game.capsuleCollected ? "capsule secured" : "empty",
    })
  }

  if (point.x === game.map.spawn.x && point.y === game.map.spawn.y) {
    rows.push({ label: "objective", value: "dock" })
  }

  if (point.x === game.map.capsule.x && point.y === game.map.capsule.y) {
    rows.push({
      label: "objective",
      value: game.capsuleCollected ? "capsule origin" : "capsule",
    })
  }

  const hostileSubmarine = game.hostileSubmarines.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (hasExactEntityVisibility && hostileSubmarine) {
    rows.push({ label: "entity", value: "enemy submarine" })
    rows.push({ label: "facing", value: hostileSubmarine.facing })
    rows.push({ label: "enemy id", value: hostileSubmarine.id, devOnly: true })
    rows.push({
      label: "ai",
      value: hostileSubmarine.archetype ?? "hunter",
      devOnly: true,
    })
    rows.push({ label: "mode", value: hostileSubmarine.mode, devOnly: true })
    rows.push({
      label: "intent",
      value: describeHostileIntent(hostileSubmarine),
      devOnly: true,
    })
    rows.push({
      label: "initial",
      value: hostileSubmarine.initialPosition
        ? formatPoint(hostileSubmarine.initialPosition)
        : "--",
      devOnly: true,
    })
    rows.push({
      label: "target",
      value: hostileSubmarine.target ? formatPoint(hostileSubmarine.target) : "--",
      devOnly: true,
    })
    rows.push({
      label: "last known player",
      value: hostileSubmarine.lastKnownPlayerPosition
        ? formatPoint(hostileSubmarine.lastKnownPlayerPosition)
        : "--",
      devOnly: true,
    })
    rows.push({
      label: "player vector",
      value: hostileSubmarine.lastKnownPlayerVector
        ? formatVector(hostileSubmarine.lastKnownPlayerVector)
        : "--",
      devOnly: true,
    })
    rows.push({
      label: "last known turn",
      value: String(hostileSubmarine.lastKnownPlayerTurn ?? "--"),
      devOnly: true,
    })
    rows.push({
      label: "reload",
      value: String(hostileSubmarine.reload),
      devOnly: true,
    })
    rows.push({
      label: "torpedoes",
      value: String(hostileSubmarine.torpedoAmmo ?? "--"),
      devOnly: true,
    })
    rows.push({
      label: "vls",
      value: String(hostileSubmarine.vlsAmmo ?? "--"),
      devOnly: true,
    })
    rows.push({
      label: "depth charges",
      value: String(hostileSubmarine.depthChargeAmmo ?? "--"),
      devOnly: true,
    })
    rows.push({
      label: "last sonar",
      value: String(hostileSubmarine.lastSonarTurn ?? "--"),
      devOnly: true,
    })
    rows.push({
      label: "planned path",
      value:
        hostileSubmarine.plannedPath && hostileSubmarine.plannedPath.length > 1
          ? hostileSubmarine.plannedPath.map(formatPoint).join(" -> ")
          : "--",
      devOnly: true,
    })
    rows.push({
      label: "ai log",
      value: hostileSubmarine.lastAiLog ?? "--",
      devOnly: true,
    })
  }

  const pickup = game.pickups.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (hasExactEntityVisibility && pickup) {
    rows.push({ label: "entity", value: "item" })
    rows.push({ label: "item kind", value: pickup.kind })
  }

  const fish = (game.fish ?? []).find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (hasExactEntityVisibility && fish) {
    rows.push({ label: "entity", value: "fish" })
    rows.push({ label: "facing", value: fish.facing })
    rows.push({ label: "mode", value: fish.mode, devOnly: true })
    rows.push({
      label: "target",
      value: fish.target ? formatPoint(fish.target) : "--",
      devOnly: true,
    })
  }

  const torpedo = game.torpedoes.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (hasExactEntityVisibility && torpedo) {
    rows.push({ label: "entity", value: "torpedo" })
    rows.push({ label: "direction", value: torpedo.direction })
    rows.push({ label: "sender", value: torpedo.senderId, devOnly: true })
    rows.push({
      label: "range",
      value: String(torpedo.rangeRemaining),
      devOnly: true,
    })
  }

  const depthCharge = game.depthCharges.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (hasExactEntityVisibility && depthCharge) {
    rows.push({ label: "entity", value: "depth charge" })
    rows.push({ label: "sender", value: depthCharge.senderId, devOnly: true })
    rows.push({
      label: "range",
      value: String(depthCharge.rangeRemaining),
      devOnly: true,
    })
  }

  if (
    hasExactEntityVisibility &&
    game.fallingBoulders.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    rows.push({ label: "entity", value: "falling boulder" })
  }

  if (game.shockwaveFront.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "shockwave front" })
  }

  if (game.trails.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "bubble trail" })
  }

  if (game.dust.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "dust" })
  }

  if (game.cracks.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "crack" })
  }

  return rows
}

export function filterInspectorRows(
  rows: InspectorRow[] | null,
  showDevDetails: boolean,
): InspectorRow[] | null {
  if (!rows) {
    return null
  }

  return showDevDetails ? rows : rows.filter((row) => !row.devOnly)
}

export function describeInspectorContact(
  game: GameState,
  point: Point,
): string | null {
  const index = point.y * game.map.width + point.x

  if (hasExactInspectorVisibility(game, point)) {
    return exactEntityNameAtPoint(game, point) ?? null
  }

  return normalizeInspectorContact(game.entityMemory?.[index] ?? null)
}

export function hasExactInspectorVisibility(
  game: GameState,
  point: Point,
): boolean {
  const index = point.y * game.map.width + point.x
  return (game.visibility[index] ?? 0) >= 3
}

function formatPoint(point: Point): string {
  return `${point.x},${point.y}`
}

function formatVector(vector: Point): string {
  return `${vector.x},${vector.y}`
}

function describeHostileIntent(hostileSubmarine: HostileSubmarine): string {
  switch (hostileSubmarine.mode) {
    case "retreat":
      return hostileSubmarine.target
        ? `retreating to ${formatPoint(hostileSubmarine.target)}`
        : "retreating"
    case "attack":
      return hostileSubmarine.target
        ? `pressing attack at ${formatPoint(hostileSubmarine.target)}`
        : "pressing attack"
    case "investigate":
      return hostileSubmarine.target
        ? `investigating ${formatPoint(hostileSubmarine.target)}`
        : "investigating"
    case "patrol":
      return hostileSubmarine.target
        ? `holding near ${formatPoint(hostileSubmarine.target)}`
        : "patrolling"
  }
}

function normalizeInspectorContact(contact: string | null): string | null {
  return contact === "enemy" ? "entity" : contact
}
