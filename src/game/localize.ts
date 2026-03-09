import { i18n } from "../i18n.ts"

import type {
  Direction,
  EntityMemoryKind,
  FishMode,
  HostileSubmarineArchetype,
  HostileSubmarineMode,
  HostileWeaponKind,
  PickupKind,
} from "./model.ts"
import type { TileKind } from "./mapgen.ts"

export const localizeTileKind = (tile: TileKind | "void" | null): string => {
  if (tile === "wall") return i18n._("wall")
  if (tile === "water") return i18n._("water")
  if (tile === "kelp") return i18n._("kelp")
  if (tile === "vent") return i18n._("vent")
  return i18n._("void")
}

export const localizeEntityMemory = (
  kind: EntityMemoryKind | "unknown" | string | null,
): string => {
  if (kind === "item") return i18n._("item")
  if (kind === "enemy") return i18n._("hostile entity")
  if (kind === "non-hostile") return i18n._("non-hostile contact")
  return kind === "unknown" || kind === null ? i18n._("unknown") : kind
}

export const localizePickupKind = (kind: PickupKind): string => {
  if (kind === "torpedo-cache") return i18n._("torpedo cache")
  if (kind === "depth-charge-cache") return i18n._("depth charge cache")
  return i18n._("survey map")
}

export const localizeDirection = (direction: Direction): string => {
  if (direction === "up") return i18n._("up")
  if (direction === "down") return i18n._("down")
  if (direction === "left") return i18n._("left")
  return i18n._("right")
}

export const localizeFishMode = (mode: FishMode): string => {
  if (mode === "idle") return i18n._("idle")
  if (mode === "wander") return i18n._("wander")
  return i18n._("travel")
}

export const localizeHostileMode = (mode: HostileSubmarineMode): string => {
  if (mode === "patrol") return i18n._("patrol")
  if (mode === "investigate") return i18n._("investigate")
  if (mode === "attack") return i18n._("attack")
  return i18n._("retreat")
}

export const localizeHostileArchetype = (
  archetype: HostileSubmarineArchetype | "hunter",
): string => {
  if (archetype === "scout") return i18n._("scout")
  if (archetype === "guard") return i18n._("guard")
  if (archetype === "turtle") return i18n._("turtle")
  return i18n._("hunter")
}

export const localizeHostileWeapon = (weapon: HostileWeaponKind): string => {
  if (weapon === "torpedo") return i18n._("torpedo")
  if (weapon === "vls") return i18n._("VLS")
  return i18n._("depth charge")
}

export const localizeKnowledgeSource = (
  source:
    | "visual"
    | "player sonar"
    | "relay"
    | "capsule"
    | "message"
    | "clue"
    | "none",
): string => {
  if (source === "visual") return i18n._("visual")
  if (source === "player sonar") return i18n._("player sonar")
  if (source === "relay") return i18n._("relay")
  if (source === "capsule") return i18n._("capsule")
  if (source === "message") return i18n._("message")
  if (source === "clue") return i18n._("clue")
  return i18n._("none")
}

export const localizeBoolean = (value: boolean): string => {
  return value ? i18n._("yes") : i18n._("no")
}

export const localizeAttackBlockReason = (reason: string | null): string => {
  if (reason === "reloading") return i18n._("reloading")
  if (reason === "no player fix") return i18n._("no player fix")
  if (reason === "needs direct detection") {
    return i18n._("needs direct detection")
  }
  if (reason === "player outside attack radius") {
    return i18n._("player outside attack radius")
  }
  if (reason === "stale player fix") return i18n._("stale player fix")
  if (reason === "low confidence shot skipped") {
    return i18n._("low confidence shot skipped")
  }
  if (reason === "friendly fire risk") return i18n._("friendly fire risk")
  if (reason === "no valid weapon solution") {
    return i18n._("no valid weapon solution")
  }
  return reason ?? "--"
}

export const localizeAutoMoveReason = (reason: string): string => {
  if (reason === "wall ahead") return i18n._("wall ahead")
  if (reason === "no plotted course") return i18n._("no plotted course")
  if (reason === "charted wall at destination") {
    return i18n._("charted wall at destination")
  }
  if (reason === "torpedo in sight") return i18n._("torpedo in sight")
  if (reason === "depth charge in sight") return i18n._("depth charge in sight")
  if (reason === "falling boulder in sight") {
    return i18n._("falling boulder in sight")
  }
  if (reason === "torpedo cache in sight") {
    return i18n._("torpedo cache in sight")
  }
  if (reason === "depth charge cache in sight") {
    return i18n._("depth charge cache in sight")
  }
  if (reason === "survey map in sight") return i18n._("survey map in sight")
  if (reason === "capsule in sight") return i18n._("capsule in sight")
  if (reason === "sonar") return i18n._("sonar")
  return reason
}
