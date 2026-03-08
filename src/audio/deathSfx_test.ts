import { assertEquals } from "jsr:@std/assert@1"

import {
  getDeathSampleChoices,
  getDeathVolume,
} from "./deathSfx.ts"

Deno.test("death sfx uses the metallic explosion sample", () => {
  assertEquals(getDeathSampleChoices().map(fileNameFromUrl), [
    "death-bang-explosion-metallic.mp3",
  ])
})

Deno.test("death sfx scales to the active sfx volume", () => {
  assertEquals(getDeathVolume(1), 0.6)
  assertEquals(getDeathVolume(0.5), 0.3)
})

Deno.test("death sfx volume clamps invalid values", () => {
  assertEquals(getDeathVolume(4), 0.6)
  assertEquals(getDeathVolume(-1), 0)
})

function fileNameFromUrl(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1)
}
