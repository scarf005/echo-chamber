export type AudioSettings = {
  musicEnabled: boolean
  musicVolume: number
  sfxEnabled: boolean
  sfxVolume: number
}

export const AUDIO_SETTINGS_STORAGE_KEY = "echo-chamber:audio-settings"

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicEnabled: true,
  musicVolume: 0.24,
  sfxEnabled: true,
  sfxVolume: 1,
}

export const clampAudioLevel = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

export const sliderPercentToLevel = (value: number): number => {
  return clampAudioLevel(value / 100)
}

export const levelToSliderPercent = (value: number): number => {
  return Math.round(clampAudioLevel(value) * 100)
}

export const isDocumentAudioAllowed = (
  documentState: Pick<Document, "hidden" | "hasFocus">,
): boolean => {
  return !documentState.hidden && documentState.hasFocus()
}

export const normalizeAudioSettings = (
  value: Partial<AudioSettings> | null | undefined,
): AudioSettings => {
  return {
    musicEnabled: value?.musicEnabled ?? DEFAULT_AUDIO_SETTINGS.musicEnabled,
    musicVolume: clampAudioLevel(
      value?.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume,
    ),
    sfxEnabled: value?.sfxEnabled ?? DEFAULT_AUDIO_SETTINGS.sfxEnabled,
    sfxVolume: clampAudioLevel(
      value?.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume,
    ),
  }
}

export const readAudioSettings = (
  storage: Pick<Storage, "getItem"> | null,
): AudioSettings => {
  if (!storage) {
    return DEFAULT_AUDIO_SETTINGS
  }

  try {
    const raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY)

    if (!raw) {
      return DEFAULT_AUDIO_SETTINGS
    }

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_AUDIO_SETTINGS
    }

    return normalizeAudioSettings(parsed as Partial<AudioSettings>)
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

export const writeAudioSettings = (
  storage: Pick<Storage, "setItem"> | null,
  settings: AudioSettings,
): void => {
  if (!storage) {
    return
  }

  storage.setItem(
    AUDIO_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeAudioSettings(settings)),
  )
}
