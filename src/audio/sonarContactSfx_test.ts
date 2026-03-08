import { assertEquals } from "jsr:@std/assert@1"

import {
  canPlaySonarContactPing,
  SONAR_CONTACT_COOLDOWN_MS,
  getSonarContactSampleChoices,
  getSonarContactSampleUrl,
  getSonarContactVolume,
} from "./sonarContactSfx.ts"

Deno.test("sonar contact sfx exposes both normalized samples", () => {
  assertEquals(getSonarContactSampleChoices().map(fileNameFromUrl), [
    "sonar-contact-kizilsungur.mp3",
    "sonar-contact-digital.mp3",
  ])
})

Deno.test("sonar contact sfx resolves deterministic sample urls", () => {
  assertEquals(
    fileNameFromUrl(getSonarContactSampleUrl("kizilsungur")),
    "sonar-contact-kizilsungur.mp3",
  )
  assertEquals(
    fileNameFromUrl(getSonarContactSampleUrl("digital")),
    "sonar-contact-digital.mp3",
  )
})

Deno.test("sonar contact sfx plays at half of the active sfx volume", () => {
  assertEquals(getSonarContactVolume(1), 0.5)
  assertEquals(getSonarContactVolume(0.4), 0.2)
})

Deno.test("sonar contact sfx volume clamps invalid values", () => {
  assertEquals(getSonarContactVolume(8), 0.5)
  assertEquals(getSonarContactVolume(-1), 0)
})

Deno.test("sonar contact sfx enforces a two-second cooldown", () => {
  assertEquals(canPlaySonarContactPing(null, 1_000), true)
  assertEquals(canPlaySonarContactPing(1_000, 2_999), false)
  assertEquals(canPlaySonarContactPing(1_000, 1_000 + SONAR_CONTACT_COOLDOWN_MS), true)
})

function fileNameFromUrl(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1)
}
