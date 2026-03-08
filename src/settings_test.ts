/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import { DEFAULT_AUDIO_SETTINGS } from "./audio/settings.ts"
import {
  APP_SETTINGS_STORAGE_KEY,
  AUDIO_SETTINGS_STORAGE_KEY,
  defaultAppSettings,
  DEV_ENTITY_OVERLAY_STORAGE_KEY,
  readAppSettings,
  writeAppSettings,
} from "./settings.ts"

Deno.test("defaultAppSettings follows the build mode", () => {
  assertEquals(defaultAppSettings(true), {
    audio: DEFAULT_AUDIO_SETTINGS,
    revealMap: false,
    showDevEntityOverlay: true,
  })
  assertEquals(defaultAppSettings(false), {
    audio: DEFAULT_AUDIO_SETTINGS,
    revealMap: false,
    showDevEntityOverlay: false,
  })
})

Deno.test("readAppSettings restores the unified payload", () => {
  assertEquals(
    readAppSettings(
      {
        getItem: (key) =>
          key === APP_SETTINGS_STORAGE_KEY
            ? JSON.stringify({
              audio: {
                musicEnabled: false,
                musicVolume: 0.65,
                sfxEnabled: true,
                sfxVolume: 0.4,
              },
              revealMap: true,
              showDevEntityOverlay: false,
            })
            : null,
      },
      true,
    ),
    {
      audio: {
        musicEnabled: false,
        musicVolume: 0.65,
        sfxEnabled: true,
        sfxVolume: 0.4,
      },
      revealMap: true,
      showDevEntityOverlay: false,
    },
  )
})

Deno.test("readAppSettings falls back to legacy storage keys", () => {
  assertEquals(
    readAppSettings(
      {
        getItem: (key) => {
          switch (key) {
            case APP_SETTINGS_STORAGE_KEY:
              return null
            case AUDIO_SETTINGS_STORAGE_KEY:
              return JSON.stringify({
                musicEnabled: false,
                musicVolume: 0.3,
                sfxEnabled: false,
                sfxVolume: 0.9,
              })
            case DEV_ENTITY_OVERLAY_STORAGE_KEY:
              return "false"
            default:
              return null
          }
        },
      },
      true,
    ),
    {
      audio: {
        musicEnabled: false,
        musicVolume: 0.3,
        sfxEnabled: false,
        sfxVolume: 0.9,
      },
      revealMap: false,
      showDevEntityOverlay: false,
    },
  )
})

Deno.test("writeAppSettings stores a normalized unified payload", () => {
  let capturedKey = ""
  let capturedValue = ""

  writeAppSettings(
    {
      setItem: (key, value) => {
        capturedKey = key
        capturedValue = value
      },
    },
    {
      audio: {
        musicEnabled: true,
        musicVolume: 9,
        sfxEnabled: false,
        sfxVolume: -1,
      },
      revealMap: true,
      showDevEntityOverlay: false,
    },
    true,
  )

  assertEquals(capturedKey, APP_SETTINGS_STORAGE_KEY)
  assertEquals(JSON.parse(capturedValue), {
    audio: {
      musicEnabled: true,
      musicVolume: 1,
      sfxEnabled: false,
      sfxVolume: 0,
    },
    revealMap: true,
    showDevEntityOverlay: false,
  })
})
