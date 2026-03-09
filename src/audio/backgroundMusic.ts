import { Howl } from "howler"

import { ensureLoopStarted, resetHowl } from "./howlerHelpers.ts"
import { clampAudioLevel } from "./settings.ts"

const BACKGROUND_MUSIC_URL = new URL(
  "../assets/audio/unseen-presence.mp3",
  import.meta.url,
).href
const BACKGROUND_MUSIC_VOLUME = 0.24

export type BackgroundMusicController = {
  ensureStarted: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export const createBackgroundMusic = (): BackgroundMusicController => {
  const howl = new Howl({
    src: [BACKGROUND_MUSIC_URL],
    loop: true,
    preload: true,
    volume: 0,
  })
  const state = {
    enabled: true,
    volume: BACKGROUND_MUSIC_VOLUME,
  }
  const startState = {
    soundId: null as number | null,
    starting: null as Promise<void> | null,
  }

  const syncVolume = () => {
    if (startState.soundId === null) {
      return
    }

    howl.volume(state.enabled ? state.volume : 0, startState.soundId)
  }

  syncVolume()

  const ensureStarted = () => {
    return ensureLoopStarted(howl, startState).then(() => {
      syncVolume()
    })
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
    syncVolume()
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
    syncVolume()
  }

  const dispose = () => {
    resetHowl(howl)
  }

  return {
    ensureStarted,
    setEnabled,
    setVolume,
    dispose,
  }
}
