import { Howl } from "howler"

type HowlStartState = {
  soundId: number | null
}

export const ensureLoopStarted = (
  howl: Howl,
  state: HowlStartState,
): Promise<void> => {
  if (state.soundId === null) {
    state.soundId = howl.play()
    howl.once("playerror", () => {
      howl.once("unlock", () => {
        if (state.soundId === null) {
          state.soundId = howl.play()
          return
        }

        howl.play(state.soundId)
      })
    }, state.soundId)
    return Promise.resolve()
  }

  if (!howl.playing(state.soundId)) {
    howl.play(state.soundId)
  }

  return Promise.resolve()
}

export const resetHowl = (howl: Howl): void => {
  howl.stop()
  howl.unload()
}

export const playHowl = (howl: Howl, volume: number): void => {
  const soundId = howl.play()
  howl.volume(volume, soundId)
  howl.once("playerror", () => {
    howl.once("unlock", () => {
      const unlockedSoundId = howl.play()
      howl.volume(volume, unlockedSoundId)
    })
  }, soundId)
}
