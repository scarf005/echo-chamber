import { Howl } from "howler"

import { loadHowl, playHowl, resetHowl } from "./howlerHelpers.ts"
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
  const howl = new Howl({
    src: Array.from(ENTITY_HIT_SAMPLE_URLS),
    preload: true,
    pool: CHANNELS_PER_SAMPLE,
    volume: 0,
  })
  let loaded = false
  const state = {
    enabled: true,
    volume: 1,
  }

  const ensureStarted = async () => {
    if (loaded) {
      return
    }

    await loadHowl(howl)
    loaded = true
  }

  const playHit = (): Promise<void> => {
    if (!loaded || !state.enabled) {
      return Promise.resolve()
    }

    const volume = getEntityHitVolume(state.volume)

    if (volume <= 0) {
      return Promise.resolve()
    }

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
    loaded = false
    resetHowl(howl)
  }

  return {
    ensureStarted,
    playHit,
    setEnabled,
    setVolume,
    dispose,
  }
}
