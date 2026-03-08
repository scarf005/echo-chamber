export const WIN_SEED_MODE_HINT =
  "Win tip: in Options, prefix seeds with god: or map:. Combine both as god:map:your-seed."

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
