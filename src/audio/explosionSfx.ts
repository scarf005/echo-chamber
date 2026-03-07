import { sample } from "jsr:@std/random@0.1.5/sample"

import { clampAudioLevel } from "./settings.ts"

const NEAR_EXPLOSION_URLS = [
  "/audio/underwater-explosion-1.mp3",
  "/audio/underwater-explosion-2.mp3",
  "/audio/underwater-explosion-3.mp3",
] as const
const MID_EXPLOSION_URLS = [
  "/audio/underwater-explosion-2.mp3",
  "/audio/underwater-explosion-3.mp3",
  "/audio/underwater-explosion-far.mp3",
] as const
const FAR_EXPLOSION_URLS = [
  "/audio/underwater-explosion-3.mp3",
  "/audio/underwater-explosion-far.mp3",
] as const
const MAX_AUDIBLE_DISTANCE = 24
const MAX_EXPLOSION_VOLUME = 0.92
const CHANNELS_PER_SAMPLE = 3

export type ExplosionSfxController = {
  ensureStarted: () => Promise<void>
  playExplosion: (distance: number) => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export function getExplosionSampleChoices(distance: number): readonly string[] {
  return explosionPaletteForDistance(distance)
}

export function pickExplosionSampleUrl(distance: number): string {
  const palette = getExplosionSampleChoices(distance)
  return sample(palette) ?? FAR_EXPLOSION_URLS[0]
}

export function getExplosionVolume(distance: number): number {
  const clampedDistance = Math.max(0, distance)

  if (clampedDistance >= MAX_AUDIBLE_DISTANCE) {
    return 0
  }

  const normalized = 1 - clampedDistance / MAX_AUDIBLE_DISTANCE
  return Number((normalized ** 1.7 * MAX_EXPLOSION_VOLUME).toFixed(3))
}

export function createExplosionSfx(): ExplosionSfxController {
  const sampleUrls: string[] = Array.from(
    new Set([
      ...NEAR_EXPLOSION_URLS,
      ...MID_EXPLOSION_URLS,
      ...FAR_EXPLOSION_URLS,
    ]),
  )
  const playersByUrl = new Map(sampleUrls.map((url) => [
    url,
    Array.from(
      { length: CHANNELS_PER_SAMPLE },
      () => createExplosionPlayer(url),
    ),
  ]))
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

    await Promise.all(sampleUrls.flatMap((url) => {
      const players = playersByUrl.get(url) ?? []
      return players.map(primeExplosionPlayer)
    }))
    unlocked = true
  }

  const playExplosion = async (distance: number) => {
    if (!unlocked || !state.enabled) {
      return
    }

    const volume = clampAudioLevel(getExplosionVolume(distance) * state.volume)

    if (volume <= 0) {
      return
    }

    const sampleUrl = pickExplosionSampleUrl(distance)
    const audio = takeExplosionPlayer(
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

    for (const players of playersByUrl.values()) {
      for (const player of players) {
        player.pause()
        player.src = ""
        player.load()
      }
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

function explosionPaletteForDistance(distance: number): readonly string[] {
  if (distance <= 4) {
    return NEAR_EXPLOSION_URLS
  }

  if (distance <= 10) {
    return MID_EXPLOSION_URLS
  }

  return FAR_EXPLOSION_URLS
}

function createExplosionPlayer(url: string): HTMLAudioElement {
  const audio = new Audio(url)
  audio.preload = "auto"
  return audio
}

async function primeExplosionPlayer(audio: HTMLAudioElement): Promise<void> {
  audio.volume = 0
  audio.muted = true

  try {
    await audio.play()
  } catch {
    return
  }

  audio.pause()
  audio.currentTime = 0
  audio.muted = false
}

function takeExplosionPlayer(
  players: HTMLAudioElement[],
  preferredIndex: number,
): HTMLAudioElement | null {
  if (players.length === 0) {
    return null
  }

  return players.find((player) => player.paused || player.ended) ??
    players[preferredIndex % players.length]
}
