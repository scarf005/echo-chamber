import {
  createAudioPlayersByUrl,
  primeAudioPlayersByUrl,
  resetAudioPlayersByUrl,
  takeAudioPlayer,
} from "./htmlAudio.ts"
import { clampAudioLevel } from "./settings.ts"

const ENTITY_HIT_SAMPLE_URLS = [
  new URL("../assets/audio/underwater-blub-03.mp3", import.meta.url).href,
] as const
const ENTITY_HIT_VOLUME = 0.42
const CHANNELS_PER_SAMPLE = 3

export type EntityHitSfxController = {
  ensureStarted: () => Promise<void>
  playHit: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export const getEntityHitSampleChoices = (): readonly string[] => {
  return ENTITY_HIT_SAMPLE_URLS
}

export const getEntityHitVolume = (volume: number): number => {
  return clampAudioLevel(volume) * ENTITY_HIT_VOLUME
}

export const createEntityHitSfx = (): EntityHitSfxController => {
  const sampleUrls = Array.from(ENTITY_HIT_SAMPLE_URLS)
  const playersByUrl = createAudioPlayersByUrl(sampleUrls, CHANNELS_PER_SAMPLE)
  const nextPlayerIndexByUrl = new Map(sampleUrls.map((url) => [url, 0]))
  let unlocked = false
  const state = {
    enabled: true,
    volume: 1,
  }

  const ensureStarted = async () => {
    if (unlocked) {
      return
    }

    await primeAudioPlayersByUrl(playersByUrl)
    unlocked = true
  }

  const playHit = async () => {
    if (!unlocked || !state.enabled) {
      return
    }

    const volume = getEntityHitVolume(state.volume)

    if (volume <= 0) {
      return
    }

    const sampleUrl = ENTITY_HIT_SAMPLE_URLS[0]
    const players = playersByUrl.get(sampleUrl) ?? []
    const preferredIndex = nextPlayerIndexByUrl.get(sampleUrl) ?? 0
    const audio = takeAudioPlayer(players, preferredIndex)

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

    try {
      await audio.play()
    } catch {
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

    resetAudioPlayersByUrl(playersByUrl)
  }

  return {
    ensureStarted,
    playHit,
    setEnabled,
    setVolume,
    dispose,
  }
}
