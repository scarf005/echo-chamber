const MOVEMENT_LOOP_URL = "/audio/underwater-deep-water-loop.mp3"
const MOVING_VOLUME = 1
const IDLE_VOLUME = 0.5
const VOLUME_STEP = 0.1
const VOLUME_STEP_INTERVAL_MS = 120
const MOVEMENT_HOLD_MS = 240

export type MovementLoopController = {
  ensureStarted: () => Promise<void>
  markMovement: () => void
  dispose: () => void
}

export function getMovementTargetVolume(
  now: number,
  lastMovementAt: number,
): number {
  return now - lastMovementAt <= MOVEMENT_HOLD_MS ? MOVING_VOLUME : IDLE_VOLUME
}

export function stepVolumeTowards(current: number, target: number): number {
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
  audio.volume = IDLE_VOLUME

  let startingPlayback: Promise<void> | null = null
  let lastMovementAt = Number.NEGATIVE_INFINITY
  let tickerId: number | null = null

  const stopTicker = () => {
    if (tickerId === null) {
      return
    }

    window.clearInterval(tickerId)
    tickerId = null
  }

  const syncVolume = () => {
    const targetVolume = getMovementTargetVolume(
      performance.now(),
      lastMovementAt,
    )
    const nextVolume = stepVolumeTowards(audio.volume, targetVolume)

    if (nextVolume !== audio.volume) {
      audio.volume = nextVolume
    }

    if (audio.volume === IDLE_VOLUME && targetVolume === IDLE_VOLUME) {
      stopTicker()
    }
  }

  const ensureTicker = () => {
    if (tickerId !== null) {
      return
    }

    tickerId = window.setInterval(syncVolume, VOLUME_STEP_INTERVAL_MS)
  }

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

  const markMovement = () => {
    lastMovementAt = performance.now()
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
    dispose,
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}
