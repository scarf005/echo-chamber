import {
  AUDIO_SETTINGS_STORAGE_KEY,
  type AudioSettings,
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
  readAudioSettings,
} from "./audio/settings.ts"

export type AppSettings = {
  audio: AudioSettings
  showDevEntityOverlay: boolean
}

export const APP_SETTINGS_STORAGE_KEY = "echo-chamber:settings"
export const DEV_ENTITY_OVERLAY_STORAGE_KEY = "echo-chamber:dev-entity-overlay"

export function defaultAppSettings(isDevBuild: boolean): AppSettings {
  return {
    audio: DEFAULT_AUDIO_SETTINGS,
    showDevEntityOverlay: isDevBuild,
  }
}

export function normalizeAppSettings(
  value: Partial<AppSettings> | null | undefined,
  isDevBuild: boolean,
): AppSettings {
  return {
    audio: normalizeAudioSettings(value?.audio),
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
      showDevEntityOverlay: readLegacyDevEntityOverlaySetting(
        storage,
        defaults.showDevEntityOverlay,
      ),
    }
  }

  return {
    audio: readAudioSettings(storage),
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
