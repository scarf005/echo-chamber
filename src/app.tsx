import { t } from "@lingui/core/macro"
/// <reference path="./vite-env.d.ts" />

/// <reference types="vite/client" />

import "./app.css"
import { effect as signalEffect, signal } from "@preact/signals"
import { debounce } from "@std/async/debounce"
import type { JSX } from "preact"

import {
  createGame,
  createLogMessage,
  directionBetweenPoints,
  directionFromKey,
  dropDepthCharge,
  findAutoMoveAnomaly,
  findAutoMovePath,
  fireTorpedo,
  formatGroupedLogMessage,
  groupVisibleLogMessages,
  holdPosition,
  isAutoMoveNavigable,
  isPlayerSonarEnabled,
  keyForAutoMoveAnomaly,
  movePlayer,
  revealMap,
  shouldHaltAutoMoveForAnomaly,
  SONAR_INTERVAL,
  togglePlayerSonar,
  withGameMessage,
} from "./game/game.ts"
import { pointsEqual } from "./game/helpers.ts"
import { isPassableTile, type Point, tileAt } from "./game/mapgen.ts"
import { createBackgroundMusic } from "./audio/backgroundMusic.ts"
import { createDeathSfx } from "./audio/deathSfx.ts"
import { createEntityHitSfx } from "./audio/entityHitSfx.ts"
import { createExplosionSfx } from "./audio/explosionSfx.ts"
import { createMovementLoop } from "./audio/movementLoop.ts"
import { createPickupSfx } from "./audio/pickupSfx.ts"
import { createSonarContactSfx } from "./audio/sonarContactSfx.ts"
import { createSonarLoop } from "./audio/sonarLoop.ts"
import {
  type AudioSettings,
  isDocumentAudioAllowed,
  levelToSliderPercent,
  sliderPercentToLevel,
} from "./audio/settings.ts"
import {
  type AppSettings,
  difficultyToHostileSubmarineCount,
  readAppSettings,
  writeAppSettings,
} from "./settings.ts"
import { shouldRestartFromKey } from "./input.ts"
import {
  createRandomSeed,
  createRestartRunSeed,
  parseRunSeed,
} from "./runSeed.ts"
import { FastilesViewport } from "./render/FastilesViewport.tsx"
import {
  describeHoveredInspectorRows,
  filterInspectorRows,
} from "./render/helpers/inspector.ts"
import type { RenderOptions, ViewportMode } from "./render/options.ts"
import { activateLocale } from "./i18n.ts"
import { languageSignal } from "./signals.ts"
import { localizeAutoMoveReason } from "./game/localize.ts"

const INITIAL_RUN_SEED = createRandomSeed()
const AUTO_MOVE_DELAY_MS = 70
const LOG_PANEL_LINES = 6
const SETTINGS_PERSIST_DELAY_MS = 150
const IS_DEV_BUILD = import.meta.env.DEV
const getBrowserStorage = (): Storage | null => {
  return "localStorage" in globalThis ? globalThis.localStorage : null
}
const appSettingsSignal = signal<AppSettings>(
  readAppSettings(getBrowserStorage(), { isDevBuild: IS_DEV_BUILD }),
)
const viewportModeSignal = signal<ViewportMode>("camera")
const isOptionsOpenSignal = signal(false)
const isOrdersModalOpenSignal = signal(false)
const runSeedSignal = signal(INITIAL_RUN_SEED)
const activeRunSeedSignal = signal(INITIAL_RUN_SEED)
const previewTargetSignal = signal<Point | null>(null)
const autoMoveTargetSignal = signal<Point | null>(null)
const hoveredTileSignal = signal<Point | null>(null)

signalEffect(() => {
  const locale = languageSignal.value
  activateLocale(locale)

  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
  }
})

const shouldRevealDevMap = (settings: AppSettings): boolean => {
  return IS_DEV_BUILD && settings.revealMap
}

const createConfiguredGame = (rawSeed: string, settings: AppSettings) => {
  const runSeed = parseRunSeed(rawSeed, INITIAL_RUN_SEED)
  const game = createGame({
    seed: runSeed.gameSeed,
    hostileSubmarineCount: difficultyToHostileSubmarineCount(
      settings.difficulty,
    ),
  })
  return shouldRevealDevMap(settings) || runSeed.enableMapMode
    ? revealMap(game)
    : game
}

type AppGame = ReturnType<typeof createConfiguredGame>
const gameSignal = signal<AppGame>(
  createConfiguredGame(INITIAL_RUN_SEED, appSettingsSignal.value),
)

type AppRuntime = {
  initialized: boolean
  backgroundMusic: ReturnType<typeof createBackgroundMusic> | null
  deathSfx: ReturnType<typeof createDeathSfx> | null
  entityHitSfx: ReturnType<typeof createEntityHitSfx> | null
  explosionSfx: ReturnType<typeof createExplosionSfx> | null
  movementLoop: ReturnType<typeof createMovementLoop> | null
  pickupSfx: ReturnType<typeof createPickupSfx> | null
  sonarContactSfx: ReturnType<typeof createSonarContactSfx> | null
  sonarLoop: ReturnType<typeof createSonarLoop> | null
  playedExplosionCounts: Map<string, number>
  playedEntityHitCueCount: number
  playedDeathCueCount: number
  playedPickupCueCount: number
  playedSonarContactCueCount: number
  playedHostileSonarContactCueCount: number
  autoMoveSeenAnomalies: Set<string>
  autoMoveSeenTarget: Point | null
  audioSettings: AudioSettings
  pageAudioEnabled: boolean
}

const appRuntime: AppRuntime = {
  initialized: false,
  backgroundMusic: null,
  deathSfx: null,
  entityHitSfx: null,
  explosionSfx: null,
  movementLoop: null,
  pickupSfx: null,
  sonarContactSfx: null,
  sonarLoop: null,
  playedExplosionCounts: new Map(),
  playedEntityHitCueCount: 0,
  playedDeathCueCount: 0,
  playedPickupCueCount: 0,
  playedSonarContactCueCount: 0,
  playedHostileSonarContactCueCount: 0,
  autoMoveSeenAnomalies: new Set(),
  autoMoveSeenTarget: null,
  audioSettings: appSettingsSignal.peek().audio,
  pageAudioEnabled: typeof document === "undefined"
    ? true
    : isDocumentAudioAllowed(document),
}

const updateGame = (update: (current: AppGame) => AppGame) => {
  gameSignal.value = update(gameSignal.peek())
}

const updateAppSettings = (update: (current: AppSettings) => AppSettings) => {
  appSettingsSignal.value = update(appSettingsSignal.value)
}

const resetAutoMoveSeenAnomalies = () => {
  appRuntime.autoMoveSeenAnomalies = new Set()
  appRuntime.autoMoveSeenTarget = null
}

const clearAutoMoveRoute = () => {
  appRuntime.autoMoveSeenTarget = null
}

const beginAutoMoveRoute = (point: Point) => {
  appRuntime.autoMoveSeenTarget = { ...point }
}

const syncAudioControllers = () => {
  const currentAudioSettings = appRuntime.audioSettings
  const currentGame = gameSignal.peek()
  const pageAudioEnabled = appRuntime.pageAudioEnabled

  appRuntime.backgroundMusic?.setVolume(currentAudioSettings.musicVolume)
  appRuntime.backgroundMusic?.setEnabled(
    pageAudioEnabled && currentAudioSettings.musicEnabled,
  )
  appRuntime.deathSfx?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.deathSfx?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled,
  )
  appRuntime.entityHitSfx?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.entityHitSfx?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled,
  )
  appRuntime.movementLoop?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.movementLoop?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled,
  )
  appRuntime.pickupSfx?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.pickupSfx?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled,
  )
  appRuntime.sonarContactSfx?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.sonarContactSfx?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled,
  )
  appRuntime.sonarLoop?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.sonarLoop?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled &&
      isPlayerSonarEnabled(currentGame) && currentGame.status === "playing",
  )
  appRuntime.explosionSfx?.setVolume(currentAudioSettings.sfxVolume)
  appRuntime.explosionSfx?.setEnabled(
    pageAudioEnabled && currentAudioSettings.sfxEnabled,
  )
}

const startManagedAudio = () => {
  void appRuntime.backgroundMusic?.ensureStarted()
  void appRuntime.deathSfx?.ensureStarted()
  void appRuntime.entityHitSfx?.ensureStarted()
  void appRuntime.explosionSfx?.ensureStarted()
  void appRuntime.movementLoop?.ensureStarted()
  void appRuntime.pickupSfx?.ensureStarted()
  void appRuntime.sonarContactSfx?.ensureStarted()
  void appRuntime.sonarLoop?.ensureStarted()
}

const applyRunSeedState = (rawSeed = runSeedSignal.peek()) => {
  const normalizedSeed = parseRunSeed(rawSeed, INITIAL_RUN_SEED).rawSeed
  activeRunSeedSignal.value = normalizedSeed
  runSeedSignal.value = normalizedSeed
  viewportModeSignal.value = "camera"
  previewTargetSignal.value = null
  autoMoveTargetSignal.value = null
  hoveredTileSignal.value = null
  resetAutoMoveSeenAnomalies()
  gameSignal.value = createConfiguredGame(
    normalizedSeed,
    appSettingsSignal.peek(),
  )
}

const startRunWithSeed = (rawSeed = runSeedSignal.peek()) => {
  startManagedAudio()
  appRuntime.playedEntityHitCueCount = 0
  appRuntime.playedDeathCueCount = 0
  appRuntime.playedPickupCueCount = 0
  appRuntime.playedSonarContactCueCount = 0
  appRuntime.playedHostileSonarContactCueCount = 0
  applyRunSeedState(rawSeed)
}

const restartRun = () => {
  startRunWithSeed(createRestartRunSeed(runSeedSignal.peek(), {
    fallbackSeed: INITIAL_RUN_SEED,
  }))
}

const setViewportModeWithMessage = (nextViewportMode: ViewportMode) => {
  if (viewportModeSignal.peek() === nextViewportMode) {
    return
  }

  viewportModeSignal.value = nextViewportMode
  updateGame((current) =>
    withGameMessage(
      {
        ...current,
      },
      createLogMessage(() =>
        nextViewportMode === "full"
          ? t`Display set to full map.`
          : t`Display set to tracking camera.`, "neutral"),
    )
  )
}

const createAutoMoveWarning = (reason: string, origin: Point, point: Point) => {
  return createLogMessage(
    () => createAutoMoveStopMessage(reason, origin, point),
    "warning",
  )
}

const handleViewportTileClick = (point: Point) => {
  const game = gameSignal.peek()
  const previewTarget = previewTargetSignal.peek()

  if (isOptionsOpenSignal.peek() || game.status !== "playing") {
    return
  }

  if (!isAutoMoveNavigable(game, point)) {
    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    clearAutoMoveRoute()
    updateGame((current) =>
      withGameMessage(
        { ...current },
        createAutoMoveWarning(
          "charted wall at destination",
          current.player,
          point,
        ),
      )
    )
    return
  }

  startManagedAudio()

  if (previewTarget && pointsEqual(previewTarget, point)) {
    beginAutoMoveRoute(point)
    autoMoveTargetSignal.value = { ...point }
    updateGame((current) =>
      withGameMessage(
        { ...current },
        createLogMessage(
          () => t`Auto-nav engaged to ${formatPoint(point)}.`,
          "neutral",
        ),
      )
    )
    return
  }

  const nextPreviewPath = findAutoMovePath(game, point)

  beginAutoMoveRoute(point)
  previewTargetSignal.value = { ...point }
  autoMoveTargetSignal.value = null
  updateGame((current) =>
    withGameMessage(
      { ...current },
      nextPreviewPath.length >= 2
        ? createLogMessage(
          () =>
            t`Course plotted to ${formatPoint(point)}. Click again to engage.`,
          "neutral",
        )
        : createAutoMoveWarning("no plotted course", current.player, point),
    )
  )
}

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  const target = event.target

  if (isOptionsOpenSignal.peek() || isOrdersModalOpenSignal.peek()) {
    if (event.key === "Escape") {
      event.preventDefault()
      isOptionsOpenSignal.value = false
      isOrdersModalOpenSignal.value = false
    }

    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  }

  if (event.key === "Escape") {
    event.preventDefault()
    runSeedSignal.value = createRestartRunSeed(runSeedSignal.peek(), {
      fallbackSeed: INITIAL_RUN_SEED,
    })
    isOptionsOpenSignal.value = true
    isOrdersModalOpenSignal.value = false
    return
  }

  if (
    target instanceof HTMLElement &&
    target.closest("button, input, textarea, select, a")
  ) {
    return
  }

  if (shouldRestartFromKey(event.key, gameSignal.peek().status)) {
    event.preventDefault()
    restartRun()
    return
  }

  if (event.key === "q" || event.key === "Q") {
    event.preventDefault()
    updateGame((current) => togglePlayerSonar(current))
    return
  }

  if (event.key === "m" || event.key === "M") {
    event.preventDefault()
    setViewportModeWithMessage(
      viewportModeSignal.peek() === "full" ? "camera" : "full",
    )
    return
  }

  if (event.key === "z" || event.key === "Z") {
    event.preventDefault()
    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    clearAutoMoveRoute()
    updateGame((current) => fireTorpedo(current))
    return
  }

  if (event.key === "c" || event.key === "C") {
    event.preventDefault()
    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    clearAutoMoveRoute()
    updateGame((current) => fireTorpedo(current, "up"))
    return
  }

  if (event.key === "x" || event.key === "X") {
    event.preventDefault()
    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    clearAutoMoveRoute()
    updateGame((current) => dropDepthCharge(current))
    return
  }

  if (event.key === ".") {
    event.preventDefault()
    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    clearAutoMoveRoute()
    updateGame((current) => holdPosition(current))
    return
  }

  const direction = directionFromKey(event.key)

  if (!direction) {
    return
  }

  event.preventDefault()
  previewTargetSignal.value = null
  autoMoveTargetSignal.value = null
  resetAutoMoveSeenAnomalies()
  updateGame((current) => {
    const next = movePlayer(current, direction)

    if (
      next.player.x !== current.player.x ||
      next.player.y !== current.player.y
    ) {
      appRuntime.movementLoop?.markMovement()
    }

    return next
  })
}

const ensureAppRuntime = () => {
  if (
    appRuntime.initialized || !("document" in globalThis) ||
    typeof document === "undefined"
  ) {
    return
  }

  appRuntime.initialized = true
  appRuntime.backgroundMusic = createBackgroundMusic()
  appRuntime.deathSfx = createDeathSfx()
  appRuntime.entityHitSfx = createEntityHitSfx()
  appRuntime.explosionSfx = createExplosionSfx()
  appRuntime.movementLoop = createMovementLoop()
  appRuntime.pickupSfx = createPickupSfx()
  appRuntime.sonarContactSfx = createSonarContactSfx()
  appRuntime.sonarLoop = createSonarLoop()

  const syncPageAudioEnabled = () => {
    appRuntime.pageAudioEnabled = isDocumentAudioAllowed(document)
    syncAudioControllers()
  }
  const persistAppSettings = debounce((nextAppSettings: AppSettings) => {
    writeAppSettings(getBrowserStorage(), {
      settings: nextAppSettings,
      isDevBuild: IS_DEV_BUILD,
    })
  }, SETTINGS_PERSIST_DELAY_MS)

  syncAudioControllers()
  globalThis.addEventListener("keydown", startManagedAudio, { passive: true })
  globalThis.addEventListener("pointerdown", startManagedAudio, {
    passive: true,
  })
  globalThis.addEventListener("focus", syncPageAudioEnabled, { passive: true })
  globalThis.addEventListener("blur", syncPageAudioEnabled, { passive: true })
  document.addEventListener("visibilitychange", syncPageAudioEnabled)
  globalThis.addEventListener("keydown", handleGlobalKeyDown)

  signalEffect(() => {
    appRuntime.audioSettings = appSettingsSignal.value.audio
    persistAppSettings(appSettingsSignal.value)
    syncAudioControllers()
  })
  signalEffect(() => {
    const game = gameSignal.value
    const nextCounts = new Map<string, number>()

    for (const shockwave of game.shockwaves) {
      if (!shockwave.damaging) {
        continue
      }

      const key =
        `${shockwave.origin.x}:${shockwave.origin.y}:${shockwave.senderId}`
      const nextCount = (nextCounts.get(key) ?? 0) + 1
      nextCounts.set(key, nextCount)

      if (nextCount <= (appRuntime.playedExplosionCounts.get(key) ?? 0)) {
        continue
      }

      const distance = Math.hypot(
        shockwave.origin.x - game.player.x,
        shockwave.origin.y - game.player.y,
      )
      void appRuntime.explosionSfx?.playExplosion(distance)
    }

    appRuntime.playedExplosionCounts = nextCounts
  })
  signalEffect(() => {
    const cueCount = gameSignal.value.playerDeathCueCount ?? 0

    if (cueCount > appRuntime.playedDeathCueCount) {
      appRuntime.playedDeathCueCount = cueCount
      void appRuntime.deathSfx?.playDeath()
    }
  })
  signalEffect(() => {
    const cueCount = gameSignal.value.playerEntityHitCueCount ?? 0

    if (cueCount > appRuntime.playedEntityHitCueCount) {
      appRuntime.playedEntityHitCueCount = cueCount
      void appRuntime.entityHitSfx?.playHit()
    }
  })
  signalEffect(() => {
    const cueCount = gameSignal.value.playerPickupCueCount ?? 0

    if (cueCount > appRuntime.playedPickupCueCount) {
      appRuntime.playedPickupCueCount = cueCount
      void appRuntime.pickupSfx?.playPickup()
    }
  })
  signalEffect(() => {
    const game = gameSignal.value
    const cueCount = game.playerSonarContactCueCount ?? 0

    if (cueCount > appRuntime.playedSonarContactCueCount) {
      appRuntime.playedSonarContactCueCount = cueCount
      void appRuntime.sonarContactSfx?.playContactPing(
        game.playerSonarContactAudioVariant ?? "kizilsungur",
      )
    }
  })
  signalEffect(() => {
    const cueCount = gameSignal.value.hostileSonarContactCueCount ?? 0

    if (cueCount > appRuntime.playedHostileSonarContactCueCount) {
      appRuntime.playedHostileSonarContactCueCount = cueCount
      void appRuntime.sonarContactSfx?.playContactPing("kizilsungur")
    }
  })
  signalEffect(() => {
    if (gameSignal.value.status === "playing") {
      return
    }

    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    hoveredTileSignal.value = null
    resetAutoMoveSeenAnomalies()
  })
  signalEffect(() => {
    const autoMoveTarget = autoMoveTargetSignal.value
    const game = gameSignal.value
    const isOptionsOpen = isOptionsOpenSignal.value

    if (!autoMoveTarget) {
      return
    }

    if (isOptionsOpen) {
      autoMoveTargetSignal.value = null
      return
    }

    if (game.status !== "playing") {
      autoMoveTargetSignal.value = null
      resetAutoMoveSeenAnomalies()
      return
    }

    if (pointsEqual(game.player, autoMoveTarget)) {
      autoMoveTargetSignal.value = null
      return
    }

    const timeoutId = globalThis.setTimeout(() => {
      updateGame((current) => {
        if (current.status !== "playing") {
          autoMoveTargetSignal.value = null
          resetAutoMoveSeenAnomalies()
          return current
        }

        const anomaly = findAutoMoveAnomaly(current)

        if (
          shouldHaltAutoMoveForAnomaly(
            appRuntime.autoMoveSeenAnomalies,
            anomaly,
          )
        ) {
          appRuntime.autoMoveSeenAnomalies = new Set([
            ...appRuntime.autoMoveSeenAnomalies,
            keyForAutoMoveAnomaly(anomaly),
          ])
          autoMoveTargetSignal.value = null
          return withGameMessage(
            { ...current },
            createAutoMoveWarning(
              anomaly.reason,
              current.player,
              anomaly.point,
            ),
          )
        }

        const path = findAutoMovePath(current, autoMoveTarget)

        if (path.length < 2) {
          autoMoveTargetSignal.value = null
          clearAutoMoveRoute()
          return withGameMessage(
            { ...current },
            createAutoMoveWarning(
              "no plotted course",
              current.player,
              autoMoveTarget,
            ),
          )
        }

        const nextPoint = path[1]

        if (!isPassableTile(tileAt(current.map, nextPoint.x, nextPoint.y))) {
          autoMoveTargetSignal.value = null
          clearAutoMoveRoute()
          return withGameMessage(
            { ...current },
            createAutoMoveWarning("wall ahead", current.player, nextPoint),
          )
        }

        const direction = directionBetweenPoints(path[0], nextPoint)

        if (!direction) {
          autoMoveTargetSignal.value = null
          clearAutoMoveRoute()
          return current
        }

        const next = movePlayer(current, direction)
        const moved = !pointsEqual(next.player, current.player)

        if (moved) {
          appRuntime.movementLoop?.markMovement()
        }

        const nextAnomaly = next.status === "playing"
          ? findAutoMoveAnomaly(next)
          : null

        if (
          shouldHaltAutoMoveForAnomaly(
            appRuntime.autoMoveSeenAnomalies,
            nextAnomaly,
          )
        ) {
          appRuntime.autoMoveSeenAnomalies = new Set([
            ...appRuntime.autoMoveSeenAnomalies,
            keyForAutoMoveAnomaly(nextAnomaly),
          ])
          autoMoveTargetSignal.value = null
          return withGameMessage(
            { ...next },
            createAutoMoveWarning(
              nextAnomaly.reason,
              next.player,
              nextAnomaly.point,
            ),
          )
        }

        if (
          !moved || pointsEqual(next.player, autoMoveTarget) ||
          next.status !== "playing"
        ) {
          autoMoveTargetSignal.value = null
          clearAutoMoveRoute()
        }

        return next
      })
    }, AUTO_MOVE_DELAY_MS)

    return () => globalThis.clearTimeout(timeoutId)
  })
}

export const App = () => {
  ensureAppRuntime()

  const isOptionsOpen = isOptionsOpenSignal.value
  const isOrdersModalOpen = isOrdersModalOpenSignal.value
  const runSeed = runSeedSignal.value
  const activeRunSeed = activeRunSeedSignal.value
  const game = gameSignal.value
  const previewTarget = previewTargetSignal.value
  const hoveredTile = hoveredTileSignal.value
  const appSettings = appSettingsSignal.value
  const locale = languageSignal.value
  const viewportMode = viewportModeSignal.value
  const audioSettings = appSettings.audio
  const difficulty = appSettings.difficulty
  const crtEnabled = appSettings.crtEnabled
  const showDevEntityOverlay = appSettings.showDevEntityOverlay
  const activeRunSeedConfig = parseRunSeed(activeRunSeed, INITIAL_RUN_SEED)
  const isRevealMapEnabled = shouldRevealDevMap(appSettings) ||
    activeRunSeedConfig.enableMapMode
  const isGodMode = game.status === "won" ||
    activeRunSeedConfig.enableGodMode ||
    (IS_DEV_BUILD && showDevEntityOverlay)
  const activeSeedModes = [
    activeRunSeedConfig.enableGodMode ? "god" : null,
    activeRunSeedConfig.enableMapMode ? "map" : null,
  ].filter((mode): mode is string => mode !== null)
  const previewPath = previewTarget ? findAutoMovePath(game, previewTarget) : []

  const sonarIn =
    ((SONAR_INTERVAL - (game.turn % SONAR_INTERVAL)) % SONAR_INTERVAL) ||
    SONAR_INTERVAL
  const playerSonarEnabled = isPlayerSonarEnabled(game)
  const playerCoordinates = formatPoint(game.player)
  const targetCoordinates = previewTarget ? formatPoint(previewTarget) : "--"
  const musicVolumePercent = levelToSliderPercent(audioSettings.musicVolume)
  const sfxVolumePercent = levelToSliderPercent(audioSettings.sfxVolume)
  const allLogMessages = groupVisibleLogMessages([
    ...game.logs,
  ], isGodMode)
  const visibleLogMessages = allLogMessages.slice(-LOG_PANEL_LINES)
  const renderOptions: RenderOptions = {
    debugEntityOverlay: isGodMode,
    debugPlannedPaths: isGodMode,
    hoveredTile: null,
    viewportMode,
    cameraTileWidth: 30,
    cameraTileHeight: 20,
  }
  const viewportLabel = viewportMode === "full"
    ? t`FULL MAP (M)`
    : t`TRACKING (M)`
  const hoveredInspectorRows = describeHoveredInspectorRows({
    game,
    point: hoveredTile,
    options: {
      revealAllEntities: isGodMode,
    },
  })
  const visibleInspectorRows = filterInspectorRows(
    hoveredInspectorRows,
    isGodMode,
  )
  const onOffLabel = (enabled: boolean) => enabled ? t`ON` : t`OFF`

  return (
    <main class="game-shell">
      <section class="viewport-stage">
        <FastilesViewport
          crtEnabled={crtEnabled}
          game={game}
          selectedTarget={previewTarget}
          previewPath={previewPath}
          onTileClick={handleViewportTileClick}
          onTileHover={(point) => {
            hoveredTileSignal.value = point
          }}
          renderOptions={renderOptions}
        />
      </section>

      <aside class="sidebar">
        <section class="sidebar-panel sidebar-panel-primary">
          <div class="panel-header">
            <div class="sidebar-heading">{t`mission status`}</div>
            <button
              type="button"
              class="icon-button"
              aria-label={t`open options`}
              aria-haspopup="dialog"
              aria-expanded={isOptionsOpen}
              onClick={() => {
                isOptionsOpenSignal.value = true
                isOrdersModalOpenSignal.value = false
              }}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <div class="stat-row">
            <span>{t`turn`}</span>
            <strong>{game.turn}</strong>
          </div>
          <div class="stat-row">
            <span>{t`sonar in`}</span>
            <strong>{playerSonarEnabled ? sonarIn : onOffLabel(false)}</strong>
          </div>
          <div class="stat-row">
            <span>{t`torpedoes`}</span>
            <strong>{game.torpedoAmmo}</strong>
          </div>
          <div class="stat-row">
            <span>{t`depth charges`}</span>
            <strong>{game.depthChargeAmmo}</strong>
          </div>
          <div class="stat-row">
            <span>{t`position`}</span>
            <strong>{playerCoordinates}</strong>
          </div>
          <div class="stat-row">
            <span>{t`target`}</span>
            <strong>{targetCoordinates}</strong>
          </div>
          <div class="stat-row">
            <span>{t`display`}</span>
            <strong>{viewportLabel}</strong>
          </div>
        </section>

        <section class="sidebar-panel log-panel">
          <div class="panel-header">
            <button
              type="button"
              class="panel-title-button"
              aria-label={t`open full order log`}
              aria-haspopup="dialog"
              aria-expanded={isOrdersModalOpen}
              onClick={() => {
                isOrdersModalOpenSignal.value = true
                isOptionsOpenSignal.value = false
              }}
            >
              <span class="sidebar-heading">{t`log`}</span>
            </button>
          </div>
          <div class="sidebar-text-block sidebar-log-list">
            {visibleLogMessages.map((entry, index) => (
              <div
                class={`sidebar-log-message sidebar-log-message-${entry.type}`}
                key={`${index}:${entry.message}:${entry.count}`}
              >
                {formatGroupedLogMessage(entry)}
              </div>
            ))}
          </div>
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-heading">{t`inspector`}</div>
          <div class="stat-row">
            <span>{t`hover tile`}</span>
            <strong>{hoveredTile ? formatPoint(hoveredTile) : "--"}</strong>
          </div>
          {visibleInspectorRows && visibleInspectorRows.length > 0
            ? (
              <div class="dev-inspector-grid">
                {visibleInspectorRows.map((row, index) => (
                  <div
                    class={`stat-row${row.devOnly ? " stat-row-dev-only" : ""}`}
                    key={`${index}:${row.label}:${row.value}`}
                  >
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            )
            : (
              <div class="sidebar-text-block">
                {t`hover any tile to inspect terrain and contacts.`}
              </div>
            )}
        </section>
      </aside>

      {isOptionsOpen
        ? (
          <div
            class="modal-backdrop"
            onClick={() => isOptionsOpenSignal.value = false}
          >
            <section
              class="modal-panel"
              role="dialog"
              aria-modal="true"
              aria-label={t`options`}
              onClick={(event) => event.stopPropagation()}
            >
              <div class="panel-header">
                <div class="sidebar-heading">{t`options`}</div>
                <button
                  type="button"
                  class="modal-close"
                  onClick={() => isOptionsOpenSignal.value = false}
                >
                  {t`close`}
                </button>
              </div>
              <div class="seed-controls">
                <div class="seed-entry-row">
                  <input
                    class="seed-input"
                    type="text"
                    value={runSeed}
                    autocomplete="off"
                    placeholder={t`seed`}
                    aria-label={t`run seed`}
                    onInput={(event: JSX.TargetedEvent<HTMLInputElement>) => {
                      runSeedSignal.value = event.currentTarget.value
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      restartRun()
                      isOptionsOpenSignal.value = false
                    }}
                  >
                    {t`restart`}
                  </button>
                </div>
                {activeSeedModes.length > 0
                  ? (
                    <div class="sidebar-text-block">
                      {t`active seed modes`}: {activeSeedModes.join(", ")}.
                    </div>
                  )
                  : null}
              </div>
              <div class="language-switch-row">
                <span class="sidebar-heading">{t`language`}</span>
                <div
                  class="language-switch"
                  role="group"
                  aria-label={t`language`}
                >
                  <button
                    type="button"
                    class={`language-switch-button${
                      locale === "en" ? " is-active" : ""
                    }`}
                    aria-pressed={locale === "en"}
                    aria-label={t`English`}
                    onClick={() => languageSignal.value = "en"}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    class={`language-switch-button${
                      locale === "ko" ? " is-active" : ""
                    }`}
                    aria-pressed={locale === "ko"}
                    aria-label={t`Korean`}
                    onClick={() => languageSignal.value = "ko"}
                  >
                    Korean
                  </button>
                </div>
              </div>
              <div class="language-switch-row">
                <span class="sidebar-heading">{t`difficulty`}</span>
                <div
                  class="language-switch"
                  role="group"
                  aria-label={t`difficulty`}
                >
                  <button
                    type="button"
                    class={`language-switch-button${
                      difficulty === "easy" ? " is-active" : ""
                    }`}
                    aria-pressed={difficulty === "easy"}
                    aria-label={t`easy`}
                    onClick={() => {
                      updateAppSettings((current) => ({
                        ...current,
                        difficulty: "easy",
                      }))
                    }}
                  >
                    {t`easy`} (1x)
                  </button>
                  <button
                    type="button"
                    class={`language-switch-button${
                      difficulty === "medium" ? " is-active" : ""
                    }`}
                    aria-pressed={difficulty === "medium"}
                    aria-label={t`medium`}
                    onClick={() => {
                      updateAppSettings((current) => ({
                        ...current,
                        difficulty: "medium",
                      }))
                    }}
                  >
                    {t`medium`} (2x)
                  </button>
                  <button
                    type="button"
                    class={`language-switch-button${
                      difficulty === "hard" ? " is-active" : ""
                    }`}
                    aria-pressed={difficulty === "hard"}
                    aria-label={t`hard`}
                    onClick={() => {
                      updateAppSettings((current) => ({
                        ...current,
                        difficulty: "hard",
                      }))
                    }}
                  >
                    {t`hard`} (4x)
                  </button>
                </div>
              </div>
              <div class="language-switch-row">
                <span class="sidebar-heading">{t`graphics`}</span>
                <div class="language-switch">
                  <span>{t`CRT effect`}</span>
                  <input
                    class="audio-toggle"
                    type="checkbox"
                    checked={crtEnabled}
                    aria-label={t`toggle CRT effect`}
                    onChange={(
                      event: JSX.TargetedEvent<HTMLInputElement>,
                    ) => {
                      updateAppSettings((current) => ({
                        ...current,
                        crtEnabled: event.currentTarget.checked,
                      }))
                    }}
                  />
                  <strong style={{ width: "3em" }}>
                    {onOffLabel(crtEnabled)}
                  </strong>
                </div>
              </div>
              <div class="sidebar-heading">{t`audio`}</div>
              <div class="audio-controls">
                <div class="audio-setting">
                  <span>{t`music`}</span>
                  <div class="audio-setting-row">
                    <input
                      class="audio-slider"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={musicVolumePercent}
                      aria-label={t`music volume`}
                      onInput={(event: JSX.TargetedEvent<HTMLInputElement>) => {
                        const nextVolume = sliderPercentToLevel(
                          Number(event.currentTarget.value),
                        )
                        updateAppSettings((current) => ({
                          ...current,
                          audio: {
                            ...current.audio,
                            musicVolume: nextVolume,
                          },
                        }))
                      }}
                    />
                    <input
                      class="audio-toggle"
                      type="checkbox"
                      checked={audioSettings.musicEnabled}
                      aria-label={t`enable music`}
                      onChange={(
                        event: JSX.TargetedEvent<HTMLInputElement>,
                      ) => {
                        updateAppSettings((current) => ({
                          ...current,
                          audio: {
                            ...current.audio,
                            musicEnabled: event.currentTarget.checked,
                          },
                        }))
                      }}
                    />
                    <strong>{musicVolumePercent}%</strong>
                  </div>
                </div>
                <div class="audio-setting">
                  <span>{t`sfx`}</span>
                  <div class="audio-setting-row">
                    <input
                      class="audio-slider"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={sfxVolumePercent}
                      aria-label={t`sfx volume`}
                      onInput={(event: JSX.TargetedEvent<HTMLInputElement>) => {
                        const nextVolume = sliderPercentToLevel(
                          Number(event.currentTarget.value),
                        )
                        updateAppSettings((current) => ({
                          ...current,
                          audio: {
                            ...current.audio,
                            sfxVolume: nextVolume,
                          },
                        }))
                      }}
                    />
                    <input
                      class="audio-toggle"
                      type="checkbox"
                      checked={audioSettings.sfxEnabled}
                      aria-label={t`enable sfx`}
                      onChange={(
                        event: JSX.TargetedEvent<HTMLInputElement>,
                      ) => {
                        updateAppSettings((current) => ({
                          ...current,
                          audio: {
                            ...current.audio,
                            sfxEnabled: event.currentTarget.checked,
                          },
                        }))
                      }}
                    />
                    <strong>{sfxVolumePercent}%</strong>
                  </div>
                </div>
              </div>
              {IS_DEV_BUILD
                ? (
                  <div class="dev-only-block">
                    <div class="sidebar-heading">{t`dev`}</div>
                    <div class="audio-controls">
                      <div class="audio-setting">
                        <span>{t`map visibility`}</span>
                        <div class="audio-setting-row">
                          <span>{t`reveal map`}</span>
                          <input
                            class="audio-toggle"
                            type="checkbox"
                            checked={appSettings.revealMap}
                            aria-label={t`reveal map`}
                            onChange={(
                              event: JSX.TargetedEvent<HTMLInputElement>,
                            ) => {
                              const { checked } = event.currentTarget
                              updateAppSettings((current) => ({
                                ...current,
                                revealMap: checked,
                              }))

                              if (checked) {
                                updateGame((current) => revealMap(current))
                              }
                            }}
                          />
                          <strong>{onOffLabel(isRevealMapEnabled)}</strong>
                        </div>
                      </div>
                      <div class="audio-setting">
                        <span>{t`map overlay`}</span>
                        <div class="audio-setting-row">
                          <span>
                            {t`god mode`}
                          </span>
                          <input
                            class="audio-toggle"
                            type="checkbox"
                            checked={showDevEntityOverlay}
                            aria-label={t`god mode`}
                            onChange={(
                              event: JSX.TargetedEvent<HTMLInputElement>,
                            ) => {
                              updateAppSettings((current) => ({
                                ...current,
                                showDevEntityOverlay:
                                  event.currentTarget.checked,
                              }))
                            }}
                          />
                          <strong>{onOffLabel(showDevEntityOverlay)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )
                : null}
              <div class="sidebar-heading">{t`credits`}</div>
              <div class="credit-list">
                <a
                  class="credit-link"
                  href="https://github.com/rbanffy/3270font"
                  target="_blank"
                  rel="noreferrer"
                >
                  IBM 3270 by Ricardo Banffy and contributors (BSD-3-Clause)
                </a>
                <a
                  class="credit-link"
                  href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2000008"
                  target="_blank"
                  rel="noreferrer"
                >
                  SCP-x2x (Unseen Presence) by Kevin MacLeod (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Werra/sounds/244394/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Bang/Explosion Metallic by Werra (CC0-1.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Department64/sounds/651743/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Underwater Deep Water Loop by Department64 (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Department64/sounds/651744/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Underwater Blub 03 by Department64 (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/gulfstreamav/sounds/841162/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Reload by gulfstreamav (CC0-1.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Akkaittou/sounds/819743/"
                  target="_blank"
                  rel="noreferrer"
                >
                  UnderWater_Explosion1 by Akkaittou (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Akkaittou/sounds/819744/"
                  target="_blank"
                  rel="noreferrer"
                >
                  UnderWater_Explosion2 by Akkaittou (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Akkaittou/sounds/819745/"
                  target="_blank"
                  rel="noreferrer"
                >
                  UnderWater_Explosion3 by Akkaittou (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/Akkaittou/sounds/819746/"
                  target="_blank"
                  rel="noreferrer"
                >
                  UnderWater_ExplosionFar by Akkaittou (CC-BY-4.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/kwahmah_02/sounds/268835/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sonar (tuned to F).wav by kwahmah_02 (CC-BY-3.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/KIZILSUNGUR/sounds/70299/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sonar.wav by KIZILSUNGUR (CC0-1.0)
                </a>
                <a
                  class="credit-link"
                  href="https://freesound.org/people/digit-al/sounds/90340/"
                  target="_blank"
                  rel="noreferrer"
                >
                  sonar.wav by digit-al (CC0-1.0)
                </a>
              </div>
            </section>
          </div>
        )
        : null}

      {isOrdersModalOpen
        ? (
          <div
            class="modal-backdrop"
            onClick={() => isOrdersModalOpenSignal.value = false}
          >
            <section
              class="modal-panel message-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t`log`}
              onClick={(event) => event.stopPropagation()}
            >
              <div class="panel-header">
                <div class="sidebar-heading">{t`log`}</div>
                <button
                  type="button"
                  class="modal-close"
                  onClick={() => isOrdersModalOpenSignal.value = false}
                >
                  {t`close`}
                </button>
              </div>
              <div class="message-modal-scroll">
                {allLogMessages.map((entry, index) => (
                  <div
                    class={`sidebar-log-message sidebar-log-message-${entry.type}`}
                    key={`${index}:${entry.message}:${entry.count}`}
                  >
                    {formatGroupedLogMessage(entry)}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )
        : null}
    </main>
  )
}

const createAutoMoveStopMessage = (
  reason: string,
  origin: Point,
  point: Point,
): string => {
  const bearing = formatBearing(origin, point)
  const localizedReason = localizeAutoMoveReason(reason)

  return t`Auto-nav halted: ${localizedReason} at ${formatPoint(point)}${
    bearing ? ` ${bearing}` : ""
  }.`
}

const formatPoint = (point: Point): string => {
  return `${point.x},${point.y}`
}

const formatBearing = (from: Point, to: Point): string => {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)

  switch (`${dx},${dy}`) {
    case "0,-1":
      return "↑"
    case "1,-1":
      return "↗"
    case "1,0":
      return "→"
    case "1,1":
      return "↘"
    case "0,1":
      return "↓"
    case "-1,1":
      return "↙"
    case "-1,0":
      return "←"
    case "-1,-1":
      return "↖"
    default:
      return ""
  }
}
