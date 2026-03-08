/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { formatRunSeed, parseRunSeed, randomizeRunSeed } from "./runSeed.ts"

Deno.test("parseRunSeed keeps a plain seed unchanged", () => {
  assertEquals(parseRunSeed("abyss", "fallback"), {
    rawSeed: "abyss",
    gameSeed: "abyss",
    enableGodMode: false,
    enableMapMode: false,
  })
})

Deno.test("parseRunSeed enables god mode from a god prefix", () => {
  assertEquals(parseRunSeed("god:abyss", "fallback"), {
    rawSeed: "god:abyss",
    gameSeed: "abyss",
    enableGodMode: true,
    enableMapMode: false,
  })
})

Deno.test("parseRunSeed enables both prefixes in any order", () => {
  assertEquals(parseRunSeed("map:god:abyss", "fallback"), {
    rawSeed: "god:map:abyss",
    gameSeed: "abyss",
    enableGodMode: true,
    enableMapMode: true,
  })
})

Deno.test("parseRunSeed falls back when only prefixes are provided", () => {
  assertEquals(parseRunSeed("god:map:", "fallback"), {
    rawSeed: "god:map:fallback",
    gameSeed: "fallback",
    enableGodMode: true,
    enableMapMode: true,
  })
})

Deno.test("formatRunSeed rebuilds a seed with mode prefixes", () => {
  assertEquals(
    formatRunSeed("abyss", { enableGodMode: true, enableMapMode: true }),
    "god:map:abyss",
  )
})

Deno.test("randomizeRunSeed preserves active prefixes with a new base seed", () => {
  assertEquals(
    randomizeRunSeed("map:god:abyss", "fallback", "trench-42"),
    "god:map:trench-42",
  )
})
