import { sample } from "jsr:@std/random@0.1.5/sample"

import { clampAudioLevel } from "./settings.ts"

const SONAR_CONTACT_SAMPLE_URLS = [
  "/audio/sonar-contact-kizilsungur.mp3",
  "/audio/sonar-contact-digital.mp3",
] as const
const SONAR_CONTACT_VOLUME = 0.5
const CHANNELS_PER_SAMPLE = 2

export type SonarContactSfxController = {
  ensureStarted: () => Promise<void>
  playContactPing: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export function getSonarContactSampleChoices(): readonly string[] {
  return SONAR_CONTACT_SAMPLE_URLS
}

export function getSonarContactVolume(volume: number): number {
  return clampAudioLevel(volume) * SONAR_CONTACT_VOLUME
}

export function createSonarContactSfx(): SonarContactSfxController {
  const sampleUrls = Array.from(SONAR_CONTACT_SAMPLE_URLS)
  const playersByUrl = new Map(sampleUrls.map((url) => [
    url,
    Array.from({ length: CHANNELS_PER_SAMPLE }, () => createPlayer(url)),
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
      return players.map(primePlayer)
    }))
    unlocked = true
  }

  const playContactPing = async () => {
    if (!unlocked || !state.enabled) {
      return
    }

    const volume = getSonarContactVolume(state.volume)

    if (volume <= 0) {
      return
    }

    const sampleUrl = sample(sampleUrls) ?? sampleUrls[0]
    const players = playersByUrl.get(sampleUrl) ?? []
    const preferredIndex = nextPlayerIndexByUrl.get(sampleUrl) ?? 0
    const audio = takePlayer(players, preferredIndex)

    if (!audio) {
      return
    }

    nextPlayerIndexByUrl.set(
      sampleUrl,
      (preferredIndex + 1) % CHANNELS_PER_SAMPLE,
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
    playContactPing,
    setEnabled,
    setVolume,
    dispose,
  }
}

function createPlayer(url: string): HTMLAudioElement {
  const audio = new Audio(url)
  audio.preload = "auto"
  return audio
}

async function primePlayer(audio: HTMLAudioElement): Promise<void> {
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

function takePlayer(
  players: HTMLAudioElement[],
  preferredIndex: number,
): HTMLAudioElement | null {
  if (players.length === 0) {
    return null
  }

  return players.find((player) => player.paused || player.ended) ??
    players[preferredIndex % players.length]
}
