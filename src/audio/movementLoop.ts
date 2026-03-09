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
  const audio = new Audio(MOVEMENT_LOOP_URL)
  audio.loop = true
  audio.preload = "auto"
  const state = {
    enabled: true,
    volume: 1,
  }

  const resolveTargetVolume = (baseVolume: number): number => {
    if (!state.enabled) {
      return 0
    }

    return clampAudioLevel(baseVolume * state.volume)
  }

  audio.volume = resolveTargetVolume(IDLE_VOLUME)

  let startingPlayback: Promise<void> | null = null
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
    const nextVolume = stepVolumeTowards(audio.volume, targetVolume)

    if (nextVolume !== audio.volume) {
      audio.volume = nextVolume
    }

    if (
      audio.volume === targetVolume &&
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
    if (!audio.paused) {
      return Promise.resolve()
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

    return startingPlayback ?? Promise.resolve()
  }

  const markMovement = () => {
    lastMovementAt = performance.now()
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
    audio.pause()
    audio.src = ""
    audio.load()
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
