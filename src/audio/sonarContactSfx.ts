import type { SonarContactAudioVariant } from "../game/model.ts"
import { Howl } from "howler"

import { playHowl, resetHowl } from "./howlerHelpers.ts"
import { clampAudioLevel } from "./settings.ts"

const SONAR_CONTACT_SAMPLE_URLS = {
  kizilsungur: new URL(
    "../assets/audio/sonar-contact-kizilsungur.mp3",
    import.meta.url,
  ).href,
  digital: new URL("../assets/audio/sonar-contact-digital.mp3", import.meta.url)
    .href,
} as const
const SONAR_CONTACT_SAMPLE_ORDER = ["kizilsungur", "digital"] as const
const SONAR_CONTACT_VOLUME = 0.5
export const SONAR_CONTACT_COOLDOWN_MS = 2_000
const CHANNELS_PER_SAMPLE = 2

export type SonarContactSfxController = {
  ensureStarted: () => Promise<void>
  playContactPing: (variant?: SonarContactAudioVariant) => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export const getSonarContactSampleChoices = (): readonly string[] => {
  return SONAR_CONTACT_SAMPLE_ORDER.map((variant) =>
    SONAR_CONTACT_SAMPLE_URLS[variant]
  )
}

export const getSonarContactSampleUrl = (
  variant: SonarContactAudioVariant,
): string => {
  return SONAR_CONTACT_SAMPLE_URLS[variant]
}

export const getSonarContactVolume = (volume: number): number => {
  return clampAudioLevel(volume) * SONAR_CONTACT_VOLUME
}

export const canPlaySonarContactPing = (
  lastPlayedAt: number | null,
  playedAt: number,
): boolean => {
  return lastPlayedAt === null ||
    playedAt - lastPlayedAt >= SONAR_CONTACT_COOLDOWN_MS
}

export const createSonarContactSfx = (): SonarContactSfxController => {
  const sampleUrls = Array.from(getSonarContactSampleChoices())
  const howlsByUrl = new Map(sampleUrls.map((url) => [
    url,
    new Howl({
      src: [url],
      preload: true,
      pool: CHANNELS_PER_SAMPLE,
      volume: 0,
    }),
  ]))
  let lastPlayedAt: number | null = null
  const state = {
    enabled: true,
    volume: 1,
  }

  const ensureStarted = () => Promise.resolve()

  const playContactPing = (
    variant: SonarContactAudioVariant = "kizilsungur",
  ): Promise<void> => {
    if (!state.enabled) {
      return Promise.resolve()
    }

    const volume = getSonarContactVolume(state.volume)

    if (volume <= 0) {
      return Promise.resolve()
    }

    const playedAt = Date.now()

    if (!canPlaySonarContactPing(lastPlayedAt, playedAt)) {
      return Promise.resolve()
    }

    const sampleUrl = getSonarContactSampleUrl(variant)
    const howl = howlsByUrl.get(sampleUrl)

    if (!howl) {
      return Promise.resolve()
    }

    lastPlayedAt = playedAt

    playHowl(howl, volume)
    return Promise.resolve()
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
  }

  const dispose = () => {
    lastPlayedAt = null

    for (const howl of howlsByUrl.values()) {
      resetHowl(howl)
    }
  }

  return {
    ensureStarted,
    playContactPing,
    setEnabled,
    setVolume,
    dispose,
  }
}
