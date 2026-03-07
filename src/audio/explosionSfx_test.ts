import { assertEquals } from "jsr:@std/assert@1"

import {
  getExplosionSampleChoices,
  getExplosionVolume,
} from "./explosionSfx.ts"

Deno.test("getExplosionSampleChoices groups nearby blasts into near palette", () => {
  assertEquals(getExplosionSampleChoices(2), [
    "/audio/underwater-explosion-1.mp3",
    "/audio/underwater-explosion-2.mp3",
    "/audio/underwater-explosion-3.mp3",
  ])
})

Deno.test("getExplosionSampleChoices shifts to distant palette for remote blasts", () => {
  assertEquals(getExplosionSampleChoices(18), [
    "/audio/underwater-explosion-3.mp3",
    "/audio/underwater-explosion-far.mp3",
  ])
})

Deno.test("getExplosionVolume falls off with distance and mutes beyond range", () => {
  assertEquals(getExplosionVolume(0), 0.92)
  assertEquals(getExplosionVolume(8) < getExplosionVolume(2), true)
  assertEquals(getExplosionVolume(24), 0)
  assertEquals(getExplosionVolume(30), 0)
})
