type AudioPlaybackState = {
  startingPlayback: Promise<void> | null
}

export const ensureAudioElementStarted = (
  audio: HTMLAudioElement,
  state: AudioPlaybackState,
): Promise<void> => {
  if (!audio.paused) {
    return Promise.resolve()
  }

  if (state.startingPlayback) {
    return state.startingPlayback
  }

  state.startingPlayback = audio.play()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      state.startingPlayback = null
    })

  return state.startingPlayback
}

export const resetAudioElement = (audio: HTMLAudioElement): void => {
  audio.pause()
  audio.src = ""
  audio.load()
}

export const createAudioPlayersByUrl = (
  sampleUrls: readonly string[],
  channelCount: number,
): Map<string, HTMLAudioElement[]> => {
  return new Map(sampleUrls.map((url) => [
    url,
    Array.from({ length: channelCount }, () => {
      const audio = new Audio(url)
      audio.preload = "auto"
      return audio
    }),
  ]))
}

export const primeAudioPlayer = async (
  audio: HTMLAudioElement,
): Promise<void> => {
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

export const primeAudioPlayersByUrl = async (
  playersByUrl: ReadonlyMap<string, HTMLAudioElement[]>,
): Promise<void> => {
  await Promise.all(
    Array.from(playersByUrl.values()).flatMap((players) =>
      players.map(primeAudioPlayer)
    ),
  )
}

export const takeAudioPlayer = (
  players: HTMLAudioElement[],
  preferredIndex: number,
): HTMLAudioElement | null => {
  if (players.length === 0) {
    return null
  }

  return players.find((player) => player.paused || player.ended) ??
    players[preferredIndex % players.length]
}

export const resetAudioPlayersByUrl = (
  playersByUrl: ReadonlyMap<string, HTMLAudioElement[]>,
): void => {
  for (const players of playersByUrl.values()) {
    for (const player of players) {
      resetAudioElement(player)
    }
  }
}
