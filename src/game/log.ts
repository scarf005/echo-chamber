import { i18n } from "../i18n.ts"
import type { GameState, LogMessage, LogMessageTone } from "./model.ts"

const logMessageResolvers = new WeakMap<LogMessage, () => string>()

const INITIAL_MISSION_MESSAGE = createLogMessage(
  i18n._(
    "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
  ),
  "neutral",
  () =>
    i18n._(
      "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
    ),
)
const HELP_LOG_MESSAGES = [
  createLogMessage(i18n._("Move with WASD or arrows."), "neutral", () => i18n._("Move with WASD or arrows.")),
  createLogMessage(i18n._("Click once to plot a course."), "neutral", () => i18n._("Click once to plot a course.")),
  createLogMessage(i18n._("Click the same tile again to engage auto-nav."), "neutral", () => i18n._("Click the same tile again to engage auto-nav.")),
  createLogMessage(i18n._("Wait with ."), "neutral", () => i18n._("Wait with .")),
  createLogMessage(i18n._("Launch torpedo with Z."), "neutral", () => i18n._("Launch torpedo with Z.")),
  createLogMessage(i18n._("Launch torpedo upwards with C."), "neutral", () => i18n._("Launch torpedo upwards with C.")),
  createLogMessage(i18n._("Drop depth charge with X."), "neutral", () => i18n._("Drop depth charge with X.")),
  createLogMessage(i18n._("Toggle display with M."), "neutral", () => i18n._("Toggle display with M.")),
  createLogMessage(
    i18n._("When sunk, press R to restart. Use Options for restart or random run anytime."),
    "neutral",
    () => i18n._("When sunk, press R to restart. Use Options for restart or random run anytime."),
  ),
]
export const MAX_LOG_MESSAGES = 200

export interface GroupedLogMessage extends LogMessage {
  count: number
}

export function createLogMessage(
  message: string,
  type: LogMessageTone = "neutral",
  resolveMessage?: () => string,
): LogMessage {
  const entry: LogMessage = { message, type }

  if (resolveMessage) {
    logMessageResolvers.set(entry, resolveMessage)
  }

  return entry
}

export function createInitialLogs(): LogMessage[] {
  return [INITIAL_MISSION_MESSAGE, ...HELP_LOG_MESSAGES].map((entry) => cloneLogMessage(entry))
}

export function createInitialMissionMessage(): string {
  return resolveLogMessageText(INITIAL_MISSION_MESSAGE)
}

export function withGameMessage(
  game: GameState,
  message: LogMessage | string,
): GameState {
  const nextLog = typeof message === "string" ? createLogMessage(message) : message
  const nextMessage = resolveLogMessageText(nextLog).trim()

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
      cloneLogMessage(nextLog, nextMessage),
    ].slice(-MAX_LOG_MESSAGES),
  }
}

export function groupLogMessages(
  messages: readonly LogMessage[],
): GroupedLogMessage[] {
  return messages.reduce<GroupedLogMessage[]>((entries, message) => {
    const previous = entries.at(-1)

    if (
      previous &&
      getLogMessageKey(previous) === getLogMessageKey(message) &&
      previous.type === message.type
    ) {
      return [
        ...entries.slice(0, -1),
        cloneGroupedLogMessage(previous, previous.count + 1),
      ]
    }

    return [...entries, cloneGroupedLogMessage(message, 1)]
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
  const message = resolveLogMessageText(entry)
  return entry.count > 1 ? `${message} (x${entry.count})` : message
}

export function resolveLogMessageText(entry: Pick<LogMessage, "message">): string {
  return logMessageResolvers.get(entry as LogMessage)?.() ?? entry.message
}

function getLogMessageKey(entry: LogMessage | undefined): string {
  if (!entry) {
    return ""
  }

  return resolveLogMessageText(entry)
}

function cloneLogMessage(entry: LogMessage, message = entry.message): LogMessage {
  const clone = createLogMessage(message, entry.type, logMessageResolvers.get(entry))
  return clone
}

function cloneGroupedLogMessage(entry: LogMessage, count: number): GroupedLogMessage {
  return Object.assign(cloneLogMessage(entry), { count })
}
