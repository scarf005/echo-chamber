import { clampAudioLevel } from "./settings.ts"

const DEATH_SAMPLE_URLS = [
  new URL("../assets/audio/death-bang-explosion-metallic.mp3", import.meta.url)
    .href,
] as const
const DEATH_VOLUME = 0.6
const DEATH_REVERB_MIX = 0.58
const DEATH_REVERB_DURATION_SECONDS = 3.4
const DEATH_REVERB_DECAY = 3.1

export type DeathSfxController = {
  ensureStarted: () => Promise<void>
  playDeath: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

type ActiveDeathPlayback = {
  source: AudioBufferSourceNode
  output: GainNode
  dry: GainNode
  wet: GainNode
  convolver: ConvolverNode
}

export function getDeathSampleChoices(): readonly string[] {
  return DEATH_SAMPLE_URLS
}

export function getDeathVolume(volume: number): number {
  return clampAudioLevel(volume) * DEATH_VOLUME
}

export function createDeathSfx(): DeathSfxController {
  const state = {
    enabled: true,
    volume: 1,
  }
  let audioContext: AudioContext | null = null
  let deathBuffer: AudioBuffer | null = null
  let reverbBuffer: AudioBuffer | null = null
  let startingPromise: Promise<void> | null = null
  const activePlaybacks = new Set<ActiveDeathPlayback>()

  const ensureStarted = async () => {
    if (deathBuffer && reverbBuffer && audioContext) {
      if (audioContext.state === "suspended") {
        await audioContext.resume()
      }

      return
    }

    if (!audioContext) {
      if (typeof AudioContext === "undefined") {
        return
      }

      audioContext = new AudioContext()
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume()
    }

    if (deathBuffer && reverbBuffer) {
      return
    }

    if (!startingPromise) {
      startingPromise = loadDeathAudio(audioContext).then((buffer) => {
        deathBuffer = buffer
        reverbBuffer = createImpulseResponse(
          audioContext as AudioContext,
          DEATH_REVERB_DURATION_SECONDS,
          DEATH_REVERB_DECAY,
        )
      }).finally(() => {
        startingPromise = null
      })
    }

    await startingPromise
  }

  const playDeath = async () => {
    if (!state.enabled) {
      return
    }

    await ensureStarted()

    if (!audioContext || !deathBuffer || !reverbBuffer) {
      return
    }

    const volume = getDeathVolume(state.volume)

    if (volume <= 0) {
      return
    }

    const source = audioContext.createBufferSource()
    source.buffer = deathBuffer

    const output = audioContext.createGain()
    output.gain.value = volume

    const dry = audioContext.createGain()
    dry.gain.value = 1 - DEATH_REVERB_MIX

    const wet = audioContext.createGain()
    wet.gain.value = DEATH_REVERB_MIX

    const convolver = audioContext.createConvolver()
    convolver.buffer = reverbBuffer

    source.connect(dry)
    dry.connect(output)
    source.connect(convolver)
    convolver.connect(wet)
    wet.connect(output)
    output.connect(audioContext.destination)

    const playback = { source, output, dry, wet, convolver }
    activePlaybacks.add(playback)
    source.onended = () => {
      activePlaybacks.delete(playback)
      disconnectPlayback(playback)
    }

    source.start(0)
  }

  const setEnabled = (enabled: boolean) => {
    state.enabled = enabled
  }

  const setVolume = (volume: number) => {
    state.volume = clampAudioLevel(volume)
  }

  const dispose = () => {
    for (const playback of activePlaybacks) {
      playback.source.stop()
      disconnectPlayback(playback)
    }

    activePlaybacks.clear()
    deathBuffer = null
    reverbBuffer = null
    startingPromise = null

    if (audioContext) {
      void audioContext.close()
      audioContext = null
    }
  }

  return {
    ensureStarted,
    playDeath,
    setEnabled,
    setVolume,
    dispose,
  }
}

async function loadDeathAudio(audioContext: AudioContext): Promise<AudioBuffer> {
  const response = await fetch(DEATH_SAMPLE_URLS[0])

  if (!response.ok) {
    throw new Error(`Failed to load death sample: ${response.status}`)
  }

  const encoded = await response.arrayBuffer()
  return await audioContext.decodeAudioData(encoded)
}

function createImpulseResponse(
  audioContext: AudioContext,
  durationSeconds: number,
  decay: number,
): AudioBuffer {
  const frameCount = Math.max(
    1,
    Math.floor(audioContext.sampleRate * durationSeconds),
  )
  const impulse = audioContext.createBuffer(
    2,
    frameCount,
    audioContext.sampleRate,
  )

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel)

    for (let frame = 0; frame < frameCount; frame += 1) {
      const progress = frame / frameCount
      const noise = Math.random() * 2 - 1
      data[frame] = noise * ((1 - progress) ** decay)
    }
  }

  return impulse
}

function disconnectPlayback(playback: ActiveDeathPlayback): void {
  playback.source.disconnect()
  playback.convolver.disconnect()
  playback.dry.disconnect()
  playback.wet.disconnect()
  playback.output.disconnect()
}
