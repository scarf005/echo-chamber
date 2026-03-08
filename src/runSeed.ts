import { StringGenerator } from "npm:rot-js@^2.2.1"

export const WIN_SEED_MODE_HINT =
  "Win tip: in Options, prefix seeds with god: or map:. Combine both as god:map:your-seed."

const RANDOM_SEED_TRAINING_WORDS = [
  "abyss",
  "anchor",
  "ballast",
  "brine",
  "capsule",
  "cavern",
  "chamber",
  "charge",
  "current",
  "dark",
  "depth",
  "drift",
  "echo",
  "gloom",
  "gulch",
  "harbor",
  "hunter",
  "keel",
  "kelp",
  "mine",
  "pressure",
  "reef",
  "salvo",
  "scout",
  "shoal",
  "signal",
  "sonar",
  "steel",
  "surge",
  "torpedo",
  "trench",
  "undertow",
  "vault",
  "vent",
  "wake",
  "wreck",
]
const RANDOM_SEED_TOKEN_COUNT = 2
const FALLBACK_RANDOM_SEED = "depth-charge"

const randomSeedGenerator = createRandomSeedGenerator()

export interface RunSeedConfig {
  rawSeed: string
  gameSeed: string
  enableGodMode: boolean
  enableMapMode: boolean
}

interface RunSeedFlags {
  enableGodMode: boolean
  enableMapMode: boolean
}

const GOD_MODE_PREFIX = "god:"
const MAP_MODE_PREFIX = "map:"

export function parseRunSeed(rawSeed: string, fallbackSeed: string): RunSeedConfig {
  let remaining = rawSeed.trim()
  let enableGodMode = false
  let enableMapMode = false

  while (true) {
    const lowerSeed = remaining.toLowerCase()

    if (lowerSeed.startsWith(GOD_MODE_PREFIX)) {
      enableGodMode = true
      remaining = remaining.slice(GOD_MODE_PREFIX.length).trimStart()
      continue
    }

    if (lowerSeed.startsWith(MAP_MODE_PREFIX)) {
      enableMapMode = true
      remaining = remaining.slice(MAP_MODE_PREFIX.length).trimStart()
      continue
    }

    break
  }

  const gameSeed = remaining.trim() || fallbackSeed

  return {
    rawSeed: formatRunSeed(gameSeed, {
      enableGodMode,
      enableMapMode,
    }),
    gameSeed,
    enableGodMode,
    enableMapMode,
  }
}

export function formatRunSeed(gameSeed: string, flags: RunSeedFlags): string {
  return `${flags.enableGodMode ? GOD_MODE_PREFIX : ""}${flags.enableMapMode ? MAP_MODE_PREFIX : ""}${gameSeed.trim()}`
}

export function randomizeRunSeed(
  rawSeed: string,
  fallbackSeed: string,
  nextGameSeed: string,
): string {
  const parsedSeed = parseRunSeed(rawSeed, fallbackSeed)
  return formatRunSeed(nextGameSeed, {
    enableGodMode: parsedSeed.enableGodMode,
    enableMapMode: parsedSeed.enableMapMode,
  })
}

export function createRandomSeed(): string {
  const tokens = Array.from(
    { length: RANDOM_SEED_TOKEN_COUNT },
    () => createRandomSeedToken(),
  ).filter((token): token is string => token.length > 0)

  return tokens.length === RANDOM_SEED_TOKEN_COUNT
    ? tokens.join("-")
    : FALLBACK_RANDOM_SEED
}

function createRandomSeedGenerator(): StringGenerator {
  const generator = new StringGenerator({ order: 3, prior: 0.01 })

  for (const word of RANDOM_SEED_TRAINING_WORDS) {
    generator.observe(word)
  }

  return generator
}

function createRandomSeedToken(): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = sanitizeRandomSeedToken(randomSeedGenerator.generate())

    if (candidate.length >= 4 && candidate.length <= 10) {
      return candidate
    }
  }

  return ""
}

function sanitizeRandomSeedToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z]/g, "")
}
