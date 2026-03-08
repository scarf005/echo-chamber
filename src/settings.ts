import {
  AUDIO_SETTINGS_STORAGE_KEY,
  type AudioSettings,
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
  readAudioSettings,
} from "./audio/settings.ts"
import { DEFAULT_HOSTILE_SUBMARINE_COUNT } from "./game/constants.ts"

export type DifficultySetting = "easy" | "medium" | "hard"

export const DEFAULT_DIFFICULTY_SETTING: DifficultySetting = "easy"

export function normalizeDifficultySetting(
  value: unknown,
): DifficultySetting {
  return value === "medium" || value === "hard"
    ? value
    : DEFAULT_DIFFICULTY_SETTING
}

export function difficultyToHostileSubmarineCount(
  difficulty: DifficultySetting,
  hardCount = DEFAULT_HOSTILE_SUBMARINE_COUNT,
): number {
  if (difficulty === "hard") {
    return hardCount
  }

  const divisor = difficulty === "medium" ? 2 : 4
  return Math.max(1, Math.floor(hardCount / divisor))
}

export type AppSettings = {
  audio: AudioSettings
  difficulty: DifficultySetting
  revealMap: boolean
  showDevEntityOverlay: boolean
}

export const APP_SETTINGS_STORAGE_KEY = "echo-chamber:settings"
export const DEV_ENTITY_OVERLAY_STORAGE_KEY = "echo-chamber:dev-entity-overlay"

export function defaultAppSettings(isDevBuild: boolean): AppSettings {
  return {
    audio: DEFAULT_AUDIO_SETTINGS,
    difficulty: DEFAULT_DIFFICULTY_SETTING,
    revealMap: false,
    showDevEntityOverlay: isDevBuild,
  }
}

export function normalizeAppSettings(
  value: Partial<AppSettings> | null | undefined,
  isDevBuild: boolean,
): AppSettings {
  return {
    audio: normalizeAudioSettings(value?.audio),
    difficulty: normalizeDifficultySetting(value?.difficulty),
    revealMap: isDevBuild ? (value?.revealMap ?? false) : false,
    showDevEntityOverlay: value?.showDevEntityOverlay ?? isDevBuild,
  }
}

export function readAppSettings(
  storage: Pick<Storage, "getItem"> | null,
  isDevBuild: boolean,
): AppSettings {
  const defaults = defaultAppSettings(isDevBuild)

  if (!storage) {
    return defaults
  }

  try {
    const raw = storage.getItem(APP_SETTINGS_STORAGE_KEY)

    if (raw) {
      const parsed = JSON.parse(raw)

      if (parsed && typeof parsed === "object") {
        return normalizeAppSettings(parsed as Partial<AppSettings>, isDevBuild)
      }
    }
  } catch {
    return {
      audio: readAudioSettings(storage),
      difficulty: defaults.difficulty,
      revealMap: defaults.revealMap,
      showDevEntityOverlay: readLegacyDevEntityOverlaySetting(
        storage,
        defaults.showDevEntityOverlay,
      ),
    }
  }

  return {
    audio: readAudioSettings(storage),
    difficulty: defaults.difficulty,
    revealMap: defaults.revealMap,
    showDevEntityOverlay: readLegacyDevEntityOverlaySetting(
      storage,
      defaults.showDevEntityOverlay,
    ),
  }
}

export function writeAppSettings(
  storage: Pick<Storage, "setItem"> | null,
  settings: AppSettings,
  isDevBuild: boolean,
): void {
  if (!storage) {
    return
  }

  storage.setItem(
    APP_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeAppSettings(settings, isDevBuild)),
  )
}

function readLegacyDevEntityOverlaySetting(
  storage: Pick<Storage, "getItem">,
  defaultValue: boolean,
): boolean {
  try {
    const raw = storage.getItem(DEV_ENTITY_OVERLAY_STORAGE_KEY)

    return raw === null ? defaultValue : raw === "true"
  } catch {
    return defaultValue
  }
}

export { AUDIO_SETTINGS_STORAGE_KEY }
