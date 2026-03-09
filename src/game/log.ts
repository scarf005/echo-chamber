import { i18n } from "../i18n.ts"
import { partition } from "@std/collections"
import type { GameState, LogMessage, LogMessageTone } from "./model.ts"

const logMessageResolvers = new WeakMap<LogMessage, () => string>()
type LogMessageSource = string | (() => string)

export const createLogMessage = (
  messageSource: LogMessageSource,
  type: LogMessageTone = "neutral",
): LogMessage => {
  const message = typeof messageSource === "function"
    ? messageSource()
    : messageSource
  const entry: LogMessage = { message, type }

  if (typeof messageSource === "function") {
    logMessageResolvers.set(entry, messageSource)
  }

  return entry
}

const INITIAL_MISSION_MESSAGE = createLogMessage(() =>
  i18n._(
    "Recover the capsule and return it to the dock. Hostile subs stalk the caverns. Sonar cycles every 5 turns.",
  ), "neutral")
const HELP_LOG_MESSAGES = [
  createLogMessage(() => i18n._("Move with WASD or arrows."), "neutral"),
  createLogMessage(() => i18n._("Click once to plot a course."), "neutral"),
  createLogMessage(
    () => i18n._("Click the same tile again to engage auto-nav."),
    "neutral",
  ),
  createLogMessage(() => i18n._("Wait with ."), "neutral"),
  createLogMessage(() => i18n._("Launch torpedo with Z."), "neutral"),
  createLogMessage(() => i18n._("Launch torpedo upwards with C."), "neutral"),
  createLogMessage(() => i18n._("Drop depth charge with X."), "neutral"),
  createLogMessage(() => i18n._("Toggle display with M."), "neutral"),
  createLogMessage(() =>
    i18n._(
      "When sunk, press R to restart. Use Options for restart or random run anytime.",
    ), "neutral"),
]
export const MAX_LOG_MESSAGES = 200

export interface GroupedLogMessage extends LogMessage {
  count: number
}

export const createInitialLogs = (): LogMessage[] => {
  return [INITIAL_MISSION_MESSAGE, ...HELP_LOG_MESSAGES].map((entry) =>
    cloneLogMessage(entry)
  )
}

export const createInitialMissionMessage = (): string => {
  return resolveLogMessageText(INITIAL_MISSION_MESSAGE)
}

export const withGameMessage = (
  game: GameState,
  message: LogMessage | string,
): GameState => {
  const nextLog = typeof message === "string"
    ? createLogMessage(message)
    : message
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

export const groupLogMessages = (
  messages: readonly LogMessage[],
): GroupedLogMessage[] => {
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

export const groupVisibleLogMessages = (
  messages: readonly LogMessage[],
  includeAiMessages = false,
): GroupedLogMessage[] => {
  const [visibleMessages] = partition(
    messages,
    (message: LogMessage) => message.type !== "ai",
  )

  return groupLogMessages(
    includeAiMessages ? messages : visibleMessages,
  )
}

export const formatGroupedLogMessage = (entry: GroupedLogMessage): string => {
  const message = resolveLogMessageText(entry)
  return entry.count > 1 ? `${message} (x${entry.count})` : message
}

export const resolveLogMessageText = (
  entry: Pick<LogMessage, "message">,
): string => {
  return logMessageResolvers.get(entry as LogMessage)?.() ?? entry.message
}

const getLogMessageKey = (entry: LogMessage | undefined): string => {
  if (!entry) {
    return ""
  }

  return resolveLogMessageText(entry)
}

const cloneLogMessage = (
  entry: LogMessage,
  message = entry.message,
): LogMessage => {
  const resolver = logMessageResolvers.get(entry)
  const clone = resolver && message === entry.message
    ? createLogMessage(resolver, entry.type)
    : createLogMessage(message, entry.type)
  return clone
}

const cloneGroupedLogMessage = (
  entry: LogMessage,
  count: number,
): GroupedLogMessage => {
  return Object.assign(cloneLogMessage(entry), { count })
}
