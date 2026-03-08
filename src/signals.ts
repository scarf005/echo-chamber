import { signal } from "@preact/signals"

import { preferredLocale, type LocaleId } from "./i18n.ts"

export const languageSignal = signal<LocaleId>(preferredLocale)
