import { clampAudioLevel } from "./settings.ts"

const ENTITY_HIT_SAMPLE_URLS = [
  new URL("../assets/audio/underwater-blub-03.mp3", import.meta.url).href,
] as const
const ENTITY_HIT_VOLUME = 0.42
const CHANNELS_PER_SAMPLE = 3

export type EntityHitSfxController = {
  ensureStarted: () => Promise<void>
  playHit: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

export const getEntityHitSampleChoices = (): readonly string[] => {
  return ENTITY_HIT_SAMPLE_URLS
}

export const getEntityHitVolume = (volume: number): number => {
  return clampAudioLevel(volume) * ENTITY_HIT_VOLUME
}

export const createEntityHitSfx = (): EntityHitSfxController => {
  const sampleUrls = Array.from(ENTITY_HIT_SAMPLE_URLS)
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

  const playHit = async () => {
    if (!unlocked || !state.enabled) {
      return
    }

    const volume = getEntityHitVolume(state.volume)

    if (volume <= 0) {
      return
    }

    const sampleUrl = ENTITY_HIT_SAMPLE_URLS[0]
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
    playHit,
    setEnabled,
    setVolume,
    dispose,
  }
}

const createPlayer = (url: string): HTMLAudioElement => {
  const audio = new Audio(url)
  audio.preload = "auto"
  return audio
}

const primePlayer = async (audio: HTMLAudioElement): Promise<void> => {
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

const takePlayer = (
  players: HTMLAudioElement[],
  preferredIndex: number,
): HTMLAudioElement | null => {
  if (players.length === 0) {
    return null
  }

  return players.find((player) => player.paused || player.ended) ??
    players[preferredIndex % players.length]
}
