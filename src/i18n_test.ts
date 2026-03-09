/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import { defaultLocale, resolvePreferredLocale } from "./i18n.ts"

Deno.test("preferred locale falls back to the default outside the browser", () => {
  const locale = resolvePreferredLocale({
    storedLocale: null,
    navigatorLanguage: "ko-KR",
    hasDocument: false,
  })

  assertEquals(locale, defaultLocale)
})

Deno.test("preferred locale honors stored locale before navigator hints", () => {
  const locale = resolvePreferredLocale({
    storedLocale: "en",
    navigatorLanguage: "ko-KR",
    hasDocument: true,
  })

  assertEquals(locale, "en")
})

Deno.test("preferred locale follows Korean navigator hints in the browser", () => {
  const locale = resolvePreferredLocale({
    storedLocale: null,
    navigatorLanguage: "ko-KR",
    hasDocument: true,
  })

  assertEquals(locale, "ko")
})
