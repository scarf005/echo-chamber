import { sample } from "@std/random/sample"
import { Howl } from "howler"

import { loadHowls, playHowl, resetHowl } from "./howlerHelpers.ts"
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
  const howlsByUrl = new Map(sampleUrls.map((url) => [
    url,
    new Howl({
      src: [url],
      preload: true,
      pool: CHANNELS_PER_SAMPLE,
      volume: 0,
    }),
  ]))
  let loaded = false
  const state = {
    enabled: true,
    volume: 1,
  }

  const ensureStarted = async () => {
    if (loaded) {
      return
    }

    await loadHowls(Array.from(howlsByUrl.values()))
    loaded = true
  }

  const playExplosion = (distance: number): Promise<void> => {
    if (!loaded || !state.enabled) {
      return Promise.resolve()
    }

    const volume = getExplosionVolume(distance) * state.volume

    if (volume <= 0) {
      return Promise.resolve()
    }

    const sampleUrl = pickExplosionSampleUrl(distance)
    const howl = howlsByUrl.get(sampleUrl)

    if (!howl) {
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

    for (const howl of howlsByUrl.values()) {
      resetHowl(howl)
    }
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
