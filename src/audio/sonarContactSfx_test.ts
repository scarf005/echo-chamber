import { assertEquals } from "jsr:@std/assert@1"

import {
  getSonarContactSampleChoices,
  getSonarContactVolume,
} from "./sonarContactSfx.ts"

Deno.test("sonar contact sfx rotates between both normalized samples", () => {
  assertEquals(getSonarContactSampleChoices(), [
    "/audio/sonar-contact-kizilsungur.mp3",
    "/audio/sonar-contact-digital.mp3",
  ])
})

Deno.test("sonar contact sfx plays at half of the active sfx volume", () => {
  assertEquals(getSonarContactVolume(1), 0.5)
  assertEquals(getSonarContactVolume(0.4), 0.2)
})

Deno.test("sonar contact sfx volume clamps invalid values", () => {
  assertEquals(getSonarContactVolume(8), 0.5)
  assertEquals(getSonarContactVolume(-1), 0)
})
