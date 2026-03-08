import type { GameState } from "./model.ts"

const INITIAL_MISSION_MESSAGE =
  "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns."
const HELP_LOG_MESSAGES = [
  "Move with WASD or arrows.",
  "Click once to plot a course.",
  "Click the same tile again to engage auto-nav.",
  "Wait with .",
  "Launch torpedo with Z.",
  "Drop depth charge with X.",
  "Toggle display with M.",
  "Press R for random run.",
]
const MAX_LOG_MESSAGES = 200

export interface GroupedLogMessage {
  message: string
  count: number
}

export function createInitialLogs(): string[] {
  return [INITIAL_MISSION_MESSAGE, ...HELP_LOG_MESSAGES]
}

export function createInitialMissionMessage(): string {
  return INITIAL_MISSION_MESSAGE
}

export function withGameMessage(game: GameState, message: string): GameState {
  const nextMessage = message.trim()

  if (nextMessage.length === 0) {
    return {
      ...game,
      message: nextMessage,
    }
  }

  return {
    ...game,
    message: nextMessage,
    logs: [...game.logs, nextMessage].slice(-MAX_LOG_MESSAGES),
  }
}

export function groupLogMessages(
  messages: readonly string[],
): GroupedLogMessage[] {
  return messages.reduce<GroupedLogMessage[]>((entries, message) => {
    const previous = entries.at(-1)

    if (previous?.message === message) {
      return [
        ...entries.slice(0, -1),
        {
          ...previous,
          count: previous.count + 1,
        },
      ]
    }

    return [...entries, { message, count: 1 }]
  }, [])
}

export function formatGroupedLogMessage(entry: GroupedLogMessage): string {
  return entry.count > 1 ? `${entry.message} (x${entry.count})` : entry.message
}
