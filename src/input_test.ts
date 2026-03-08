/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { shouldRestartFromKey } from "./input.ts"

Deno.test("shouldRestartFromKey only allows restart after the run ends", () => {
  assertEquals(shouldRestartFromKey("r", "playing"), false)
  assertEquals(shouldRestartFromKey("R", "won"), true)
  assertEquals(shouldRestartFromKey("r", "lost"), true)
  assertEquals(shouldRestartFromKey("R", "lost"), true)
})
