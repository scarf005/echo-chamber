import { Howl } from "howler"

import { ensureLoopStarted, resetHowl } from "./howlerHelpers.ts"
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

export const getSonarLoopVolume = (volume: number): number => {
  return clampAudioLevel(volume) * SONAR_LOOP_VOLUME
}

export const stepSonarLoopVolume = (
  current: number,
  target: number,
): number => {
  if (current === target) {
    return target
  }

  if (current < target) {
    return Math.min(target, roundToHundredth(current + SONAR_FADE_STEP))
  }

  return Math.max(target, roundToHundredth(current - SONAR_FADE_STEP))
}

export const createSonarLoop = (): SonarLoopController => {
  const howl = new Howl({
    src: [SONAR_LOOP_URL],
    loop: true,
    preload: true,
    volume: 0,
  })
  const state = {
    enabled: true,
    volume: 1,
  }
  let tickerId: number | null = null

  const targetVolume = () =>
    state.enabled ? getSonarLoopVolume(state.volume) : 0
  const startState = {
    soundId: null as number | null,
    starting: null as Promise<void> | null,
  }
  let currentVolume = targetVolume()

  const syncVolume = () => {
    const nextVolume = stepSonarLoopVolume(currentVolume, targetVolume())

    if (nextVolume !== currentVolume) {
      currentVolume = nextVolume
    }

    if (startState.soundId !== null) {
      howl.volume(currentVolume, startState.soundId)
    }

    if (
      !state.enabled && currentVolume === 0 && startState.soundId !== null &&
      howl.playing(startState.soundId)
    ) {
      howl.pause(startState.soundId)
    }

    if (currentVolume === targetVolume()) {
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

    globalThis.clearInterval(tickerId)
    tickerId = null
  }

  const ensureTicker = () => {
    if (tickerId !== null) {
      return
    }

    tickerId = globalThis.setInterval(syncVolume, SONAR_FADE_INTERVAL_MS)
  }

  const ensureStarted = () => {
    return ensureLoopStarted(howl, startState).then(() => {
      if (startState.soundId !== null) {
        howl.volume(currentVolume, startState.soundId)
      }
    })
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
    syncPlayback()
    ensureTicker()
    syncVolume()
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
    syncPlayback()
    ensureTicker()
    syncVolume()
  }

  const dispose = () => {
    stopTicker()
    resetHowl(howl)
  }

  return {
    ensureStarted,
    setEnabled,
    setVolume,
    dispose,
  }
}

const roundToHundredth = (value: number): number => {
  return Math.round(value * 100) / 100
}
