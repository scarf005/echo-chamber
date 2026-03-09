import { ensureAudioElementStarted, resetAudioElement } from "./htmlAudio.ts"
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
  const audio = new Audio(BACKGROUND_MUSIC_URL)
  audio.loop = true
  audio.preload = "auto"
  const state = {
    enabled: true,
    volume: BACKGROUND_MUSIC_VOLUME,
  }

  const syncVolume = () => {
    audio.volume = state.enabled ? state.volume : 0
  }

  syncVolume()

  const playbackState = { startingPlayback: null as Promise<void> | null }

  const ensureStarted = () => {
    return ensureAudioElementStarted(audio, playbackState)
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
    resetAudioElement(audio)
  }

  return {
    ensureStarted,
    setEnabled,
    setVolume,
    dispose,
  }
}
