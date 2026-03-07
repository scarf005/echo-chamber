const BACKGROUND_MUSIC_URL = "/audio/unseen-presence.mp3"
const BACKGROUND_MUSIC_VOLUME = 0.24

export type BackgroundMusicController = {
  ensureStarted: () => Promise<void>
  dispose: () => void
}

export const createBackgroundMusic = (): BackgroundMusicController => {
  const audio = new Audio(BACKGROUND_MUSIC_URL)
  audio.loop = true
  audio.preload = "auto"
  audio.volume = BACKGROUND_MUSIC_VOLUME

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

  const dispose = () => {
    audio.pause()
    audio.src = ""
    audio.load()
  }

  return {
    ensureStarted,
    dispose,
  }
}
