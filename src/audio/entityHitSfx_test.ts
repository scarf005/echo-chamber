import { assertEquals } from "jsr:@std/assert@1"

import {
  getEntityHitSampleChoices,
  getEntityHitVolume,
} from "./entityHitSfx.ts"

Deno.test("entity hit sfx uses the underwater blub sample", () => {
  assertEquals(getEntityHitSampleChoices(), [
    "/audio/underwater-blub-03.mp3",
  ])
})

Deno.test("entity hit sfx scales to the active sfx volume", () => {
  assertEquals(getEntityHitVolume(1), 0.42)
  assertEquals(getEntityHitVolume(0.5), 0.21)
})

Deno.test("entity hit sfx volume clamps invalid values", () => {
  assertEquals(getEntityHitVolume(4), 0.42)
  assertEquals(getEntityHitVolume(-1), 0)
})
