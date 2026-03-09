import type { SonarContactAudioVariant } from "../game/model.ts"

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
  const playersByUrl = new Map(sampleUrls.map((url) => [
    url,
    Array.from({ length: CHANNELS_PER_SAMPLE }, () => createPlayer(url)),
  ]))
  const nextPlayerIndexByUrl = new Map(sampleUrls.map((url) => [url, 0]))
  let unlocked = false
  let lastPlayedAt: number | null = null
  const state = {
    enabled: true,
    volume: 1,
  }

  const ensureStarted = async () => {
    if (unlocked) {
      return
    }

    await Promise.all(sampleUrls.flatMap((url) => {
      const players = playersByUrl.get(url) ?? []
      return players.map(primePlayer)
    }))
    unlocked = true
  }

  const playContactPing = async (
    variant: SonarContactAudioVariant = "kizilsungur",
  ) => {
    if (!unlocked || !state.enabled) {
      return
    }

    const volume = getSonarContactVolume(state.volume)

    if (volume <= 0) {
      return
    }

    const playedAt = Date.now()

    if (!canPlaySonarContactPing(lastPlayedAt, playedAt)) {
      return
    }

    const sampleUrl = getSonarContactSampleUrl(variant)
    const players = playersByUrl.get(sampleUrl) ?? []
    const preferredIndex = nextPlayerIndexByUrl.get(sampleUrl) ?? 0
    const audio = takePlayer(players, preferredIndex)

    if (!audio) {
      return
    }

    nextPlayerIndexByUrl.set(
      sampleUrl,
      (preferredIndex + 1) % CHANNELS_PER_SAMPLE,
    )

    audio.pause()
    audio.currentTime = 0
    audio.volume = volume
    audio.muted = false
    lastPlayedAt = playedAt

    try {
      await audio.play()
    } catch {
      lastPlayedAt = null
      audio.pause()
      audio.currentTime = 0
    }
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
  }

  const dispose = () => {
    unlocked = false
    lastPlayedAt = null

    for (const players of playersByUrl.values()) {
      for (const player of players) {
        player.pause()
        player.src = ""
        player.load()
      }
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

const createPlayer = (url: string): HTMLAudioElement => {
  const audio = new Audio(url)
  audio.preload = "auto"
  return audio
}

const primePlayer = async (audio: HTMLAudioElement): Promise<void> => {
  audio.volume = 0
  audio.muted = true

  try {
    await audio.play()
  } catch {
    return
  }

  audio.pause()
  audio.currentTime = 0
  audio.muted = false
}

const takePlayer = (
  players: HTMLAudioElement[],
  preferredIndex: number,
): HTMLAudioElement | null => {
  if (players.length === 0) {
    return null
  }

  return players.find((player) => player.paused || player.ended) ??
    players[preferredIndex % players.length]
}
