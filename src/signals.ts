import { signal } from "@preact/signals"

import { type LocaleId, preferredLocale } from "./i18n.ts"

export const languageSignal = signal<LocaleId>(preferredLocale)
