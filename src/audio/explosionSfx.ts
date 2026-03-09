import { sample } from "@std/random/sample"

import {
  createAudioPlayersByUrl,
  primeAudioPlayersByUrl,
  resetAudioPlayersByUrl,
  takeAudioPlayer,
} from "./htmlAudio.ts"
import { clampAudioLevel } from "./settings.ts"

const NEAR_EXPLOSION_URLS = [
  new URL("../assets/audio/underwater-explosion-1.mp3", import.meta.url).href,
  new URL("../assets/audio/underwater-explosion-2.mp3", import.meta.url).href,
  new URL("../assets/audio/underwater-explosion-3.mp3", import.meta.url).href,
] as const
const MID_EXPLOSION_URLS = [
  new URL("../assets/audio/underwater-explosion-2.mp3", import.meta.url).href,
  new URL("../assets/audio/underwater-explosion-3.mp3", import.meta.url).href,
  new URL("../assets/audio/underwater-explosion-far.mp3", import.meta.url).href,
] as const
const FAR_EXPLOSION_URLS = [
  new URL("../assets/audio/underwater-explosion-3.mp3", import.meta.url).href,
  new URL("../assets/audio/underwater-explosion-far.mp3", import.meta.url).href,
] as const
const MAX_AUDIBLE_DISTANCE = 24
const MAX_EXPLOSION_VOLUME = 1.38
const CHANNELS_PER_SAMPLE = 3

export type ExplosionSfxController = {
  ensureStarted: () => Promise<void>
  playExplosion: (distance: number) => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export const getExplosionSampleChoices = (
  distance: number,
): readonly string[] => {
  return explosionPaletteForDistance(distance)
}

export const pickExplosionSampleUrl = (distance: number): string => {
  const palette = getExplosionSampleChoices(distance)
  return sample(palette) ?? FAR_EXPLOSION_URLS[0]
}

export const getExplosionVolume = (distance: number): number => {
  const clampedDistance = Math.max(0, distance)

  if (clampedDistance >= MAX_AUDIBLE_DISTANCE) {
    return 0
  }

  return Number(MAX_EXPLOSION_VOLUME.toFixed(3))
}

export const createExplosionSfx = (): ExplosionSfxController => {
  const sampleUrls: string[] = Array.from(
    new Set([
      ...NEAR_EXPLOSION_URLS,
      ...MID_EXPLOSION_URLS,
      ...FAR_EXPLOSION_URLS,
    ]),
  )
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

  const playExplosion = async (distance: number) => {
    if (!unlocked || !state.enabled) {
      return
    }

    const volume = getExplosionVolume(distance) * state.volume

    if (volume <= 0) {
      return
    }

    const sampleUrl = pickExplosionSampleUrl(distance)
    const audio = takeAudioPlayer(
      playersByUrl.get(sampleUrl) ?? [],
      nextPlayerIndexByUrl.get(sampleUrl) ?? 0,
    )

    if (!audio) {
      return
    }

    nextPlayerIndexByUrl.set(
      sampleUrl,
      ((nextPlayerIndexByUrl.get(sampleUrl) ?? 0) + 1) % CHANNELS_PER_SAMPLE,
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
    playExplosion,
    setEnabled,
    setVolume,
    dispose,
  }
}

const explosionPaletteForDistance = (distance: number): readonly string[] => {
  if (distance <= 4) {
    return NEAR_EXPLOSION_URLS
  }

  if (distance <= 10) {
    return MID_EXPLOSION_URLS
  }

  return FAR_EXPLOSION_URLS
}
