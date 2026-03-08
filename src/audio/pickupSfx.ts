import { clampAudioLevel } from "./settings.ts"

const PICKUP_SAMPLE_URLS = [
  new URL("../assets/audio/reload-gulfstreamav.mp3", import.meta.url).href,
] as const
const PICKUP_VOLUME = 0.25
const PICKUP_REVERB_MIX = 0.38
const PICKUP_REVERB_DURATION_SECONDS = 1.8
const PICKUP_REVERB_DECAY = 2.4

export type PickupSfxController = {
  ensureStarted: () => Promise<void>
  playPickup: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  dispose: () => void
}

type ActivePickupPlayback = {
  source: AudioBufferSourceNode
  output: GainNode
  dry: GainNode
  wet: GainNode
  convolver: ConvolverNode
}

export function getPickupSampleChoices(): readonly string[] {
  return PICKUP_SAMPLE_URLS
}

export function getPickupVolume(volume: number): number {
  return clampAudioLevel(volume) * PICKUP_VOLUME
}

export function createPickupSfx(): PickupSfxController {
  const state = {
    enabled: true,
    volume: 1,
  }
  let audioContext: AudioContext | null = null
  let pickupBuffer: AudioBuffer | null = null
  let reverbBuffer: AudioBuffer | null = null
  let startingPromise: Promise<void> | null = null
  const activePlaybacks = new Set<ActivePickupPlayback>()

  const ensureStarted = async () => {
    if (pickupBuffer && reverbBuffer && audioContext) {
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

    if (pickupBuffer && reverbBuffer) {
      return
    }

    if (!startingPromise) {
      startingPromise = loadPickupAudio(audioContext).then((buffer) => {
        pickupBuffer = buffer
        reverbBuffer = createImpulseResponse(
          audioContext as AudioContext,
          PICKUP_REVERB_DURATION_SECONDS,
          PICKUP_REVERB_DECAY,
        )
      }).finally(() => {
        startingPromise = null
      })
    }

    await startingPromise
  }

  const playPickup = async () => {
    if (!state.enabled) {
      return
    }

    await ensureStarted()

    if (!audioContext || !pickupBuffer || !reverbBuffer) {
      return
    }

    const volume = getPickupVolume(state.volume)

    if (volume <= 0) {
      return
    }

    const source = audioContext.createBufferSource()
    source.buffer = pickupBuffer

    const output = audioContext.createGain()
    output.gain.value = volume

    const dry = audioContext.createGain()
    dry.gain.value = 1 - PICKUP_REVERB_MIX

    const wet = audioContext.createGain()
    wet.gain.value = PICKUP_REVERB_MIX

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
    pickupBuffer = null
    reverbBuffer = null
    startingPromise = null

    if (audioContext) {
      void audioContext.close()
      audioContext = null
    }
  }

  return {
    ensureStarted,
    playPickup,
    setEnabled,
    setVolume,
    dispose,
  }
}

async function loadPickupAudio(
  audioContext: AudioContext,
): Promise<AudioBuffer> {
  const response = await fetch(PICKUP_SAMPLE_URLS[0])

  if (!response.ok) {
    throw new Error(`Failed to load pickup sample: ${response.status}`)
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

function disconnectPlayback(playback: ActivePickupPlayback): void {
  playback.source.disconnect()
  playback.convolver.disconnect()
  playback.dry.disconnect()
  playback.wet.disconnect()
  playback.output.disconnect()
}
