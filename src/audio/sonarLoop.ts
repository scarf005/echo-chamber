import { clampAudioLevel } from "./settings.ts"

const SONAR_LOOP_URL = new URL(
  "../assets/audio/sonar-tuned-to-f.mp3",
  import.meta.url,
).href
const SONAR_LOOP_VOLUME = 0.3
const SONAR_FADE_STEP = 0.05
const SONAR_FADE_INTERVAL_MS = 80

export type SonarLoopController = {
  ensureStarted: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export function getSonarLoopVolume(volume: number): number {
  return clampAudioLevel(volume) * SONAR_LOOP_VOLUME
}

export function stepSonarLoopVolume(current: number, target: number): number {
  if (current === target) {
    return target
  }

  if (current < target) {
    return Math.min(target, roundToHundredth(current + SONAR_FADE_STEP))
  }

  return Math.max(target, roundToHundredth(current - SONAR_FADE_STEP))
}

export function createSonarLoop(): SonarLoopController {
  const audio = new Audio(SONAR_LOOP_URL)
  audio.loop = true
  audio.preload = "auto"
  const state = {
    enabled: true,
    volume: 1,
  }
  let tickerId: number | null = null

  const targetVolume = () => state.enabled ? getSonarLoopVolume(state.volume) : 0

  const syncVolume = () => {
    const nextVolume = stepSonarLoopVolume(audio.volume, targetVolume())

    if (nextVolume !== audio.volume) {
      audio.volume = nextVolume
    }

    if (!state.enabled && audio.volume === 0 && !audio.paused) {
      audio.pause()
    }

    if (audio.volume === targetVolume()) {
      stopTicker()
    }
  }

  const syncPlayback = () => {
    if (state.enabled) {
      void ensureStarted()
    }
  }

  const stopTicker = () => {
    if (tickerId === null) {
      return
    }

    window.clearInterval(tickerId)
    tickerId = null
  }

  const ensureTicker = () => {
    if (tickerId !== null) {
      return
    }

    tickerId = window.setInterval(syncVolume, SONAR_FADE_INTERVAL_MS)
  }

  audio.volume = targetVolume()

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
    ensureTicker()
    syncVolume()
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
    ensureTicker()
    syncVolume()
  }

  const dispose = () => {
    stopTicker()
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

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100
}
