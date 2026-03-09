import { Howl } from "howler"

import { ensureLoopStarted, resetHowl } from "./howlerHelpers.ts"
import { clampAudioLevel } from "./settings.ts"

const MOVEMENT_LOOP_URL = new URL(
  "../assets/audio/underwater-deep-water-loop.mp3",
  import.meta.url,
).href
const MOVING_VOLUME = 1
const IDLE_VOLUME = 0.5
const VOLUME_STEP = 0.1
const VOLUME_STEP_INTERVAL_MS = 120
const MOVEMENT_HOLD_MS = 240

export type MovementLoopController = {
  ensureStarted: () => Promise<void>
  markMovement: () => void
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export const getMovementTargetVolume = (
  now: number,
  lastMovementAt: number,
): number => {
  return now - lastMovementAt <= MOVEMENT_HOLD_MS ? MOVING_VOLUME : IDLE_VOLUME
}

export const stepVolumeTowards = (current: number, target: number): number => {
  if (current === target) {
    return target
  }

  if (current < target) {
    return Math.min(target, roundToTenth(current + VOLUME_STEP))
  }

  return Math.max(target, roundToTenth(current - VOLUME_STEP))
}

export const createMovementLoop = (): MovementLoopController => {
  const howl = new Howl({
    src: [MOVEMENT_LOOP_URL],
    loop: true,
    preload: true,
    volume: 0,
  })
  const state = {
    enabled: true,
    volume: 1,
  }
  const startState = {
    soundId: null as number | null,
  }
  let currentVolume = clampAudioLevel(IDLE_VOLUME)

  const resolveTargetVolume = (baseVolume: number): number => {
    if (!state.enabled) {
      return 0
    }

    return clampAudioLevel(baseVolume * state.volume)
  }

  let lastMovementAt = Number.NEGATIVE_INFINITY
  let tickerId: number | null = null

  const stopTicker = () => {
    if (tickerId === null) {
      return
    }

    globalThis.clearInterval(tickerId)
    tickerId = null
  }

  const syncVolume = () => {
    const baseTargetVolume = getMovementTargetVolume(
      performance.now(),
      lastMovementAt,
    )
    const targetVolume = resolveTargetVolume(baseTargetVolume)
    const nextVolume = stepVolumeTowards(currentVolume, targetVolume)

    if (nextVolume !== currentVolume) {
      currentVolume = nextVolume
    }

    if (startState.soundId !== null) {
      howl.volume(currentVolume, startState.soundId)
    }

    if (
      currentVolume === targetVolume &&
      (targetVolume === 0 || baseTargetVolume === IDLE_VOLUME)
    ) {
      stopTicker()
    }
  }

  const ensureTicker = () => {
    if (tickerId !== null) {
      return
    }

    tickerId = globalThis.setInterval(syncVolume, VOLUME_STEP_INTERVAL_MS)
  }

  const ensureStarted = () => {
    return ensureLoopStarted(howl, startState).then(() => {
      if (startState.soundId !== null) {
        howl.volume(currentVolume, startState.soundId)
      }
    })
  }

  const markMovement = () => {
    lastMovementAt = performance.now()
    void ensureStarted()
    ensureTicker()
    syncVolume()
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
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
    resetHowl(howl)
  }

  return {
    ensureStarted,
    markMovement,
    setEnabled,
    setVolume,
    dispose,
  }
}

const roundToTenth = (value: number): number => {
  return Math.round(value * 10) / 10
}
