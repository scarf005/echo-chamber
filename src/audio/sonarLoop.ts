import { clampAudioLevel } from "./settings.ts"

const SONAR_LOOP_URL = new URL(
  "../assets/audio/sonar-tuned-to-f.mp3",
  import.meta.url,
).href
const SONAR_LOOP_VOLUME = 0.3

export type SonarLoopController = {
  ensureStarted: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export function getSonarLoopVolume(volume: number): number {
  return clampAudioLevel(volume) * SONAR_LOOP_VOLUME
}

export function createSonarLoop(): SonarLoopController {
  const audio = new Audio(SONAR_LOOP_URL)
  audio.loop = true
  audio.preload = "auto"
  const state = {
    enabled: true,
    volume: 1,
  }

  const syncVolume = () => {
    audio.volume = state.enabled ? getSonarLoopVolume(state.volume) : 0
  }

  const syncPlayback = () => {
    if (!state.enabled) {
      audio.pause()
      return
    }

    void ensureStarted()
  }

  syncVolume()

  let startingPlayback: Promise<void> | null = null

  const ensureStarted = async () => {
    if (!audio.paused) {
      return
    }

    if (startingPlayback) {
      return startingPlayback
    }

    startingPlayback = audio.play()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        startingPlayback = null
      })

    return startingPlayback
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
    syncPlayback()
    syncVolume()
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
    syncVolume()
  }

  const dispose = () => {
    audio.pause()
    audio.src = ""
    audio.load()
  }

  return {
    ensureStarted,
    setEnabled,
    setVolume,
    dispose,
  }
}
