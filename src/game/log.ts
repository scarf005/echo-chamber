import { i18n } from "../i18n.ts"
import type { GameState, LogMessage, LogMessageTone } from "./model.ts"

const INITIAL_MISSION_MESSAGE = createLogMessage(
  i18n._(
    "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
  ),
)
const HELP_LOG_MESSAGES = [
  createLogMessage(i18n._("Move with WASD or arrows.")),
  createLogMessage(i18n._("Click once to plot a course.")),
  createLogMessage(i18n._("Click the same tile again to engage auto-nav.")),
  createLogMessage(i18n._("Wait with .")),
  createLogMessage(i18n._("Launch torpedo with Z.")),
  createLogMessage(i18n._("Launch torpedo upwards with C.")),
  createLogMessage(i18n._("Drop depth charge with X.")),
  createLogMessage(i18n._("Toggle display with M.")),
  createLogMessage(i18n._("When sunk, press R to restart. Use Options for restart or random run anytime.")),
]
export const MAX_LOG_MESSAGES = 200

export interface GroupedLogMessage extends LogMessage {
  count: number
}

export function createLogMessage(
  message: string,
  type: LogMessageTone = "neutral",
): LogMessage {
  return { message, type }
}

export function createInitialLogs(): LogMessage[] {
  return [INITIAL_MISSION_MESSAGE, ...HELP_LOG_MESSAGES].map((entry) => ({ ...entry }))
}

export function createInitialMissionMessage(): string {
  return INITIAL_MISSION_MESSAGE.message
}

export function withGameMessage(
  game: GameState,
  message: LogMessage | string,
): GameState {
  const nextLog = typeof message === "string" ? createLogMessage(message) : message
  const nextMessage = nextLog.message.trim()

  if (nextMessage.length === 0) {
    return {
      ...game,
      message: nextMessage,
    }
  }

  return {
    ...game,
    message: nextMessage,
    logs: [
      ...game.logs,
      {
        ...nextLog,
        message: nextMessage,
      },
    ].slice(-MAX_LOG_MESSAGES),
  }
}

export function groupLogMessages(
  messages: readonly LogMessage[],
): GroupedLogMessage[] {
  return messages.reduce<GroupedLogMessage[]>((entries, message) => {
    const previous = entries.at(-1)

    if (
      previous?.message === message.message &&
      previous.type === message.type
    ) {
      return [
        ...entries.slice(0, -1),
        {
          ...previous,
          count: previous.count + 1,
        },
      ]
    }

    return [...entries, { ...message, count: 1 }]
  }, [])
}

export function groupVisibleLogMessages(
  messages: readonly LogMessage[],
  includeAiMessages = false,
): GroupedLogMessage[] {
  return groupLogMessages(
    includeAiMessages ? messages : messages.filter((message) => message.type !== "ai"),
  )
}

export function formatGroupedLogMessage(entry: GroupedLogMessage): string {
  return entry.count > 1 ? `${entry.message} (x${entry.count})` : entry.message
}
