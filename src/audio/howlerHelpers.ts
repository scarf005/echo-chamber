import { Howl } from "howler"

type HowlStartState = {
  soundId: number | null
  starting: Promise<void> | null
}

export const loadHowl = (howl: Howl): Promise<void> => {
  if (howl.state() === "loaded") {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const handleLoad = () => {
      howl.off("load", handleLoad)
      howl.off("loaderror", handleError)
      resolve()
    }
    const handleError = () => {
      howl.off("load", handleLoad)
      howl.off("loaderror", handleError)
      resolve()
    }

    howl.once("load", handleLoad)
    howl.once("loaderror", handleError)
    howl.load()
  })
}

export const loadHowls = (howls: readonly Howl[]): Promise<void[]> => {
  return Promise.all(howls.map(loadHowl))
}

export const ensureLoopStarted = (
  howl: Howl,
  state: HowlStartState,
): Promise<void> => {
  if (state.starting) {
    return state.starting
  }

  state.starting = loadHowl(howl).then(() => {
    if (state.soundId === null) {
      state.soundId = howl.play()
    } else if (!howl.playing(state.soundId)) {
      howl.play(state.soundId)
    }

    howl.once("playerror", () => {
      howl.once("unlock", () => {
        if (state.soundId === null) {
          state.soundId = howl.play()
          return
        }

        howl.play(state.soundId)
      })
    }, state.soundId ?? undefined)
  }).finally(() => {
    state.starting = null
  })

  return state.starting
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
