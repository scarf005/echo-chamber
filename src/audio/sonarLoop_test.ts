import { assertEquals } from "jsr:@std/assert@1"

import {
  getSonarLoopVolume,
  stepSonarLoopVolume,
} from "./sonarLoop.ts"

Deno.test("sonar loop runs at thirty percent volume when sfx is maxed", () => {
  assertEquals(getSonarLoopVolume(1), 0.3)
})

Deno.test("sonar loop volume scales with the sfx slider", () => {
  assertEquals(getSonarLoopVolume(0.4), 0.12)
})

Deno.test("sonar loop volume clamps invalid values", () => {
  assertEquals(getSonarLoopVolume(4), 0.3)
  assertEquals(getSonarLoopVolume(-1), 0)
})

Deno.test("sonar loop fades in toward the enabled volume", () => {
  assertEquals(stepSonarLoopVolume(0, 0.3), 0.05)
  assertEquals(stepSonarLoopVolume(0.25, 0.3), 0.3)
})

Deno.test("sonar loop fades out toward silence", () => {
  assertEquals(stepSonarLoopVolume(0.3, 0), 0.25)
  assertEquals(stepSonarLoopVolume(0.04, 0), 0)
})
