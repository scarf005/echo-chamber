import { assertEquals } from "jsr:@std/assert"

import { markerForEntityMemory } from "./entities.ts"

Deno.test("entity memory markers distinguish item enemy and non-hostile", () => {
  assertEquals(markerForEntityMemory("item"), {
    glyph: "?",
    color: "#b7ff8a",
  })
  assertEquals(markerForEntityMemory("enemy"), {
    glyph: "?",
    color: "#ff5d55",
    backgroundColor: "#ffe28a",
  })
  assertEquals(markerForEntityMemory("non-hostile"), {
    glyph: "~",
    color: "#7dff9b",
  })
})
