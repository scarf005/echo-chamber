import { assertEquals } from "@std/assert"

import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  levelToSliderPercent,
  normalizeAudioSettings,
  readAudioSettings,
  sliderPercentToLevel,
  writeAudioSettings,
} from "./settings.ts"

Deno.test("normalizeAudioSettings clamps out-of-range values", () => {
  assertEquals(
    normalizeAudioSettings({
      musicVolume: 9,
      sfxVolume: -1,
    }),
    {
      ...DEFAULT_AUDIO_SETTINGS,
      musicVolume: 1,
      sfxVolume: 0,
    },
  )
})

Deno.test("readAudioSettings falls back when storage is empty", () => {
  assertEquals(
    readAudioSettings({ getItem: () => null }),
    DEFAULT_AUDIO_SETTINGS,
  )
})

Deno.test("readAudioSettings restores persisted values", () => {
  assertEquals(
    readAudioSettings({
      getItem: (key) =>
        key === AUDIO_SETTINGS_STORAGE_KEY
          ? JSON.stringify({
            musicEnabled: false,
            musicVolume: 0.65,
            sfxEnabled: true,
            sfxVolume: 0.4,
          })
          : null,
    }),
    {
      musicEnabled: false,
      musicVolume: 0.65,
      sfxEnabled: true,
      sfxVolume: 0.4,
    },
  )
})

Deno.test("writeAudioSettings stores normalized payload", () => {
  let capturedKey = ""
  let capturedValue = ""

  writeAudioSettings({
    setItem: (key, value) => {
      capturedKey = key
      capturedValue = value
    },
  }, {
    musicEnabled: true,
    musicVolume: 4,
    sfxEnabled: false,
    sfxVolume: 0.35,
  })

  assertEquals(capturedKey, AUDIO_SETTINGS_STORAGE_KEY)
  assertEquals(JSON.parse(capturedValue), {
    musicEnabled: true,
    musicVolume: 1,
    sfxEnabled: false,
    sfxVolume: 0.35,
  })
})

Deno.test("slider conversion helpers round-trip expected values", () => {
  assertEquals(sliderPercentToLevel(75), 0.75)
  assertEquals(levelToSliderPercent(0.24), 24)
})
