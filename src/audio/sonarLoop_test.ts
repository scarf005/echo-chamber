import { assertEquals } from "jsr:@std/assert@1"

import { getSonarLoopVolume } from "./sonarLoop.ts"

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
