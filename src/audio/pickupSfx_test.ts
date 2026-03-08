import { assertEquals } from "jsr:@std/assert@1"

import {
  getPickupSampleChoices,
  getPickupVolume,
} from "./pickupSfx.ts"

Deno.test("pickup sfx uses the requested reload sample", () => {
  assertEquals(getPickupSampleChoices(), [
    "/audio/reload-gulfstreamav.mp3",
  ])
})

Deno.test("pickup sfx scales to the active sfx volume", () => {
  assertEquals(getPickupVolume(1), 0.25)
  assertEquals(getPickupVolume(0.5), 0.125)
})

Deno.test("pickup sfx volume clamps invalid values", () => {
  assertEquals(getPickupVolume(4), 0.25)
  assertEquals(getPickupVolume(-1), 0)
})
