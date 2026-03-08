import { exactEntityNameAtPoint } from "../../game/entity_labels.ts"
import type { GameState, HostileAiDebugState, HostileSubmarine } from "../../game/game.ts"
import type { Point } from "../../game/mapgen.ts"
import { tileAt } from "../../game/mapgen.ts"

export type InspectorRow = {
  label: string
  value: string
  devOnly?: boolean
}

export type InspectorOptions = {
  revealAllEntities?: boolean
}

export function describeHoveredInspectorRows(
  game: GameState,
  point: Point | null,
  options: InspectorOptions = {},
): InspectorRow[] | null {
  if (!point) {
    return null
  }

  const index = point.y * game.map.width + point.x
  const canRevealEntities = canRevealExactInspectorDetails(game, point, options)
  const rows: InspectorRow[] = [
    { label: "terrain", value: tileAt(game.map, point.x, point.y) ?? "void" },
    { label: "contact", value: describeInspectorContact(game, point, options) ?? "--" },
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

  if (canRevealEntities && hostileSubmarine) {
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
      label: "ai log",
      value: describeHostileAiDecision(hostileSubmarine),
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
    rows.push(...describeHostileDebugRows(hostileSubmarine.debugState))
  }

  const pickup = game.pickups.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (canRevealEntities && pickup) {
    rows.push({ label: "entity", value: "item" })
    rows.push({ label: "item kind", value: pickup.kind })
  }

  const fish = (game.fish ?? []).find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (canRevealEntities && fish) {
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

  if (canRevealEntities && torpedo) {
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

  if (canRevealEntities && depthCharge) {
    rows.push({ label: "entity", value: "depth charge" })
    rows.push({ label: "sender", value: depthCharge.senderId, devOnly: true })
    rows.push({
      label: "range",
      value: String(depthCharge.rangeRemaining),
      devOnly: true,
    })
  }

  if (
    canRevealEntities &&
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
  options: InspectorOptions = {},
): string | null {
  const index = point.y * game.map.width + point.x

  if (canRevealExactInspectorDetails(game, point, options)) {
    return exactEntityNameAtPoint(game, point) ?? null
  }

  if (
    game.torpedoes.some((candidate) =>
      candidate.senderId !== "player" &&
      candidate.position.x === point.x &&
      candidate.position.y === point.y
    )
  ) {
    return "hostile entity"
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

function canRevealExactInspectorDetails(
  game: GameState,
  point: Point,
  options: InspectorOptions,
): boolean {
  return options.revealAllEntities === true || hasExactInspectorVisibility(game, point)
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

export function describeHostileAiDecision(
  hostileSubmarine: HostileSubmarine,
): string {
  const targetSuffix = hostileSubmarine.target
    ? ` ${formatPoint(hostileSubmarine.target)}`
    : ""

  return `${hostileSubmarine.id}: will ${hostileSubmarine.mode}${targetSuffix}`
}

export function describeNotableHostileAiDecision(
  hostileSubmarine: HostileSubmarine,
): string | null {
  if (!hostileSubmarine.target) {
    return null
  }

  return describeHostileAiDecision(hostileSubmarine)
}

function normalizeInspectorContact(contact: string | null): string | null {
  return contact === "enemy" ? "hostile entity" : contact
}

function describeHostileDebugRows(debugState: HostileAiDebugState | undefined): InspectorRow[] {
  if (!debugState) {
    return []
  }

  return [
    {
      label: "ai source",
      value: describeKnowledgeSource(debugState),
      devOnly: true,
    },
    {
      label: "player fix",
      value: debugState.confirmedPlayerPosition
        ? formatPoint(debugState.confirmedPlayerPosition)
        : "--",
      devOnly: true,
    },
    {
      label: "clue",
      value: debugState.cluePosition ? formatPoint(debugState.cluePosition) : "--",
      devOnly: true,
    },
    {
      label: "direct detect",
      value: formatBoolean(debugState.directDetection),
      devOnly: true,
    },
    {
      label: "sonar fix",
      value: formatBoolean(debugState.detectedByPlayerSonar),
      devOnly: true,
    },
    {
      label: "relay fix",
      value: formatBoolean(debugState.receivedImmediateRelay),
      devOnly: true,
    },
    {
      label: "capsule alert",
      value: formatBoolean(debugState.alertedByCapsuleRecovery),
      devOnly: true,
    },
    {
      label: "move target",
      value: debugState.movementTarget ? formatPoint(debugState.movementTarget) : "--",
      devOnly: true,
    },
    {
      label: "reuse path",
      value: formatBoolean(debugState.retainedPlannedPath),
      devOnly: true,
    },
    {
      label: "salvo reposition",
      value: formatBoolean(debugState.repositioningForSalvo),
      devOnly: true,
    },
    {
      label: "emit sonar",
      value: formatBoolean(debugState.emittedSonar),
      devOnly: true,
    },
    {
      label: "broadcast fix",
      value: formatBoolean(debugState.broadcastPlayerFix),
      devOnly: true,
    },
    {
      label: "sonar interval",
      value: debugState.sonarInterval === null ? "--" : String(debugState.sonarInterval),
      devOnly: true,
    },
    {
      label: "attack target",
      value: debugState.attack.attackTarget
        ? formatPoint(debugState.attack.attackTarget)
        : "--",
      devOnly: true,
    },
    {
      label: "guessed shot",
      value: debugState.attack.guessedTarget
        ? formatPoint(debugState.attack.guessedTarget)
        : "--",
      devOnly: true,
    },
    {
      label: "attack block",
      value: debugState.attack.blockedReason ?? "--",
      devOnly: true,
    },
    {
      label: "direct lane",
      value: formatBoolean(debugState.attack.directLane),
      devOnly: true,
    },
    {
      label: "horizontal shot",
      value: formatBoolean(debugState.attack.horizontalShotOpportunity),
      devOnly: true,
    },
    {
      label: "vertical shot",
      value: formatBoolean(debugState.attack.verticalShotOpportunity),
      devOnly: true,
    },
    {
      label: "ceiling trap",
      value: debugState.attack.ceilingTrapDirection ?? "--",
      devOnly: true,
    },
    {
      label: "evidence age",
      value: debugState.attack.turnAge === null ? "--" : String(debugState.attack.turnAge),
      devOnly: true,
    },
    {
      label: "confidence",
      value: debugState.attack.confidence === null
        ? "--"
        : debugState.attack.confidence.toFixed(2),
      devOnly: true,
    },
    {
      label: "fired weapon",
      value: debugState.attack.firedWeapon ?? "--",
      devOnly: true,
    },
    {
      label: "fired dir",
      value: debugState.attack.firedDirection ?? "--",
      devOnly: true,
    },
    {
      label: "salvo shots",
      value: String(debugState.attack.salvoShotsRemaining),
      devOnly: true,
    },
    {
      label: "salvo dir",
      value: debugState.attack.salvoStepDirection ?? "--",
      devOnly: true,
    },
    {
      label: "salvo move",
      value: debugState.attack.salvoMoveTarget
        ? formatPoint(debugState.attack.salvoMoveTarget)
        : "--",
      devOnly: true,
    },
  ]
}

function describeKnowledgeSource(debugState: HostileAiDebugState): string {
  if (debugState.directDetection) {
    return "visual"
  }

  if (debugState.detectedByPlayerSonar) {
    return "player sonar"
  }

  if (debugState.receivedImmediateRelay) {
    return "relay"
  }

  if (debugState.alertedByCapsuleRecovery) {
    return "capsule"
  }

  if (debugState.confirmedPlayerPosition) {
    return "message"
  }

  if (debugState.cluePosition) {
    return "clue"
  }

  return "none"
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no"
}
