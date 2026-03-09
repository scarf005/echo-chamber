/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import { DEFAULT_AUDIO_SETTINGS } from "./audio/settings.ts"
import { DEFAULT_HOSTILE_SUBMARINE_COUNT } from "./game/constants.ts"
import {
  APP_SETTINGS_STORAGE_KEY,
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_DIFFICULTY_SETTING,
  defaultAppSettings,
  DEV_ENTITY_OVERLAY_STORAGE_KEY,
  difficultyToHostileSubmarineCount,
  normalizeDifficultySetting,
  readAppSettings,
  writeAppSettings,
} from "./settings.ts"

Deno.test("defaultAppSettings follows the build mode", () => {
  assertEquals(defaultAppSettings(true), {
    audio: DEFAULT_AUDIO_SETTINGS,
    crtEnabled: true,
    difficulty: DEFAULT_DIFFICULTY_SETTING,
    revealMap: false,
    showDevEntityOverlay: true,
  })
  assertEquals(defaultAppSettings(false), {
    audio: DEFAULT_AUDIO_SETTINGS,
    crtEnabled: true,
    difficulty: DEFAULT_DIFFICULTY_SETTING,
    revealMap: false,
    showDevEntityOverlay: false,
  })
})

Deno.test("difficulty settings normalize and scale hostile counts", () => {
  assertEquals(normalizeDifficultySetting("easy"), "easy")
  assertEquals(normalizeDifficultySetting("medium"), "medium")
  assertEquals(normalizeDifficultySetting("hard"), "hard")
  assertEquals(
    normalizeDifficultySetting("unknown"),
    DEFAULT_DIFFICULTY_SETTING,
  )

  assertEquals(
    difficultyToHostileSubmarineCount("easy"),
    Math.max(1, Math.floor(DEFAULT_HOSTILE_SUBMARINE_COUNT / 4)),
  )
  assertEquals(
    difficultyToHostileSubmarineCount("medium"),
    Math.max(1, Math.floor(DEFAULT_HOSTILE_SUBMARINE_COUNT / 2)),
  )
  assertEquals(
    difficultyToHostileSubmarineCount("hard"),
    DEFAULT_HOSTILE_SUBMARINE_COUNT,
  )
  assertEquals(difficultyToHostileSubmarineCount("easy", 3), 1)
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
              crtEnabled: false,
              difficulty: "medium",
              revealMap: true,
              showDevEntityOverlay: false,
            })
            : null,
      },
      { isDevBuild: true },
    ),
    {
      audio: {
        musicEnabled: false,
        musicVolume: 0.65,
        sfxEnabled: true,
        sfxVolume: 0.4,
      },
      crtEnabled: false,
      difficulty: "medium",
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
      { isDevBuild: true },
    ),
    {
      audio: {
        musicEnabled: false,
        musicVolume: 0.3,
        sfxEnabled: false,
        sfxVolume: 0.9,
      },
      crtEnabled: true,
      difficulty: DEFAULT_DIFFICULTY_SETTING,
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
      settings: {
        audio: {
          musicEnabled: true,
          musicVolume: 9,
          sfxEnabled: false,
          sfxVolume: -1,
        },
        crtEnabled: false,
        difficulty: "hard",
        revealMap: true,
        showDevEntityOverlay: false,
      },
      isDevBuild: true,
    },
  )

  assertEquals(capturedKey, APP_SETTINGS_STORAGE_KEY)
  assertEquals(JSON.parse(capturedValue), {
    audio: {
      musicEnabled: true,
      musicVolume: 1,
      sfxEnabled: false,
      sfxVolume: 0,
    },
    crtEnabled: false,
    difficulty: "hard",
    revealMap: true,
    showDevEntityOverlay: false,
  })
})
