/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import { getMovementTargetVolume, stepVolumeTowards } from "./movementLoop.ts"

Deno.test("movement loop stays at full volume while movement is still active", () => {
  assertEquals(getMovementTargetVolume(240, 100), 1)
})

Deno.test("movement loop settles to idle volume after movement stops", () => {
  assertEquals(getMovementTargetVolume(400, 100), 0.5)
})

Deno.test("movement loop volume ramps up by ten percent", () => {
  assertEquals(stepVolumeTowards(0.5, 1), 0.6)
})

Deno.test("movement loop volume ramps down by ten percent", () => {
  assertEquals(stepVolumeTowards(1, 0.5), 0.9)
})

Deno.test("movement loop volume stops exactly at the target", () => {
  assertEquals(stepVolumeTowards(0.9, 1), 1)
  assertEquals(stepVolumeTowards(0.6, 0.5), 0.5)
})
