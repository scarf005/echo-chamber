import { t } from "@lingui/core/macro"
/// <reference path="./vite-env.d.ts" />

import "./app.css"
import { effect as signalEffect, signal } from "@preact/signals"
import { debounce } from "@std/async/debounce"
import type { JSX } from "preact"
import { useEffect, useRef } from "preact/hooks"

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
  readAppSettings,
  writeAppSettings,
} from "./settings.ts"
import { shouldRestartFromKey } from "./input.ts"
import { createRandomSeed, parseRunSeed, randomizeRunSeed } from "./runSeed.ts"
import { FastilesViewport } from "./render/FastilesViewport.tsx"
import {
  describeHoveredInspectorRows,
  filterInspectorRows,
} from "./render/helpers/inspector.ts"
import type { RenderOptions, ViewportMode } from "./render/options.ts"
import { activateLocale } from "./i18n.ts"
import { languageSignal } from "./signals.ts"
import { localizeAutoMoveReason } from "./game/localize.ts"

const DEFAULT_SEED = "echo-chamber"
const AUTO_MOVE_DELAY_MS = 70
const LOG_PANEL_LINES = 6
const SETTINGS_PERSIST_DELAY_MS = 150
const IS_DEV_BUILD = import.meta.env.DEV
const appSettingsSignal = signal<AppSettings>(
  readAppSettings(getBrowserStorage(), IS_DEV_BUILD),
)
const viewportModeSignal = signal<ViewportMode>("camera")
const isOptionsOpenSignal = signal(false)
const isOrdersModalOpenSignal = signal(false)
const runSeedSignal = signal(DEFAULT_SEED)
const activeRunSeedSignal = signal(DEFAULT_SEED)
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

function shouldRevealDevMap(settings: AppSettings): boolean {
  return IS_DEV_BUILD && settings.revealMap
}

function createConfiguredGame(rawSeed: string, settings: AppSettings) {
  const runSeed = parseRunSeed(rawSeed, DEFAULT_SEED)
  const game = createGame({ seed: runSeed.gameSeed })
  return shouldRevealDevMap(settings) || runSeed.enableMapMode
    ? revealMap(game)
    : game
}

type AppGame = ReturnType<typeof createConfiguredGame>
const gameSignal = signal<AppGame>(
  createConfiguredGame(DEFAULT_SEED, appSettingsSignal.value),
)

export function App() {
  const isOptionsOpen = isOptionsOpenSignal.value
  const isOrdersModalOpen = isOrdersModalOpenSignal.value
  const runSeed = runSeedSignal.value
  const activeRunSeed = activeRunSeedSignal.value
  const game = gameSignal.value
  const previewTarget = previewTargetSignal.value
  const autoMoveTarget = autoMoveTargetSignal.value
  const hoveredTile = hoveredTileSignal.value
  const appSettings = appSettingsSignal.value
  const locale = languageSignal.value
  const viewportMode = viewportModeSignal.value
  const audioSettings = appSettings.audio
  const showDevEntityOverlay = appSettings.showDevEntityOverlay
  const activeRunSeedConfig = parseRunSeed(activeRunSeed, DEFAULT_SEED)
  const isRevealMapEnabled = shouldRevealDevMap(appSettings) ||
    activeRunSeedConfig.enableMapMode
  const isGodMode = game.status === "won" || activeRunSeedConfig.enableGodMode ||
    (IS_DEV_BUILD && showDevEntityOverlay)
  const activeSeedModes = [
    activeRunSeedConfig.enableGodMode ? "god" : null,
    activeRunSeedConfig.enableMapMode ? "map" : null,
  ].filter((mode): mode is string => mode !== null)
  const backgroundMusicRef = useRef<
    ReturnType<typeof createBackgroundMusic> | null
  >(null)
  const deathSfxRef = useRef<ReturnType<typeof createDeathSfx> | null>(null)
  const entityHitSfxRef = useRef<ReturnType<typeof createEntityHitSfx> | null>(
    null,
  )
  const explosionSfxRef = useRef<ReturnType<typeof createExplosionSfx> | null>(
    null,
  )
  const movementLoopRef = useRef<ReturnType<typeof createMovementLoop> | null>(
    null,
  )
  const pickupSfxRef = useRef<ReturnType<typeof createPickupSfx> | null>(null)
  const sonarContactSfxRef = useRef<
    ReturnType<typeof createSonarContactSfx> | null
  >(null)
  const sonarLoopRef = useRef<ReturnType<typeof createSonarLoop> | null>(null)
  const playedExplosionCountsRef = useRef<Map<string, number>>(new Map())
  const playedEntityHitCueCountRef = useRef(0)
  const playedDeathCueCountRef = useRef(0)
  const playedPickupCueCountRef = useRef(0)
  const playedSonarContactCueCountRef = useRef(0)
  const playedHostileSonarContactCueCountRef = useRef(0)
  const autoMoveSeenAnomaliesRef = useRef<Set<string>>(new Set())
  const autoMoveSeenTargetRef = useRef<Point | null>(null)
  const audioSettingsRef = useRef(audioSettings)
  const pageAudioEnabledRef = useRef(
    typeof document === "undefined" ? true : isDocumentAudioAllowed(document),
  )

  audioSettingsRef.current = audioSettings

  const updateGame = (update: (current: AppGame) => AppGame) => {
    gameSignal.value = update(gameSignal.peek())
  }

  const updateAppSettings = (
    update: (current: AppSettings) => AppSettings,
  ) => {
    appSettingsSignal.value = update(appSettingsSignal.value)
  }

  const resetAutoMoveSeenAnomalies = () => {
    autoMoveSeenAnomaliesRef.current = new Set()
    autoMoveSeenTargetRef.current = null
  }

  const clearAutoMoveRoute = () => {
    autoMoveSeenTargetRef.current = null
  }

  const beginAutoMoveRoute = (point: Point) => {
    autoMoveSeenTargetRef.current = { ...point }
  }

  const syncAudioControllers = () => {
    const currentAudioSettings = audioSettingsRef.current
    const currentGame = gameSignal.peek()
    const pageAudioEnabled = pageAudioEnabledRef.current

    backgroundMusicRef.current?.setVolume(currentAudioSettings.musicVolume)
    backgroundMusicRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.musicEnabled,
    )
    deathSfxRef.current?.setVolume(currentAudioSettings.sfxVolume)
    deathSfxRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled,
    )
    entityHitSfxRef.current?.setVolume(currentAudioSettings.sfxVolume)
    entityHitSfxRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled,
    )
    movementLoopRef.current?.setVolume(currentAudioSettings.sfxVolume)
    movementLoopRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled,
    )
    pickupSfxRef.current?.setVolume(currentAudioSettings.sfxVolume)
    pickupSfxRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled,
    )
    sonarContactSfxRef.current?.setVolume(currentAudioSettings.sfxVolume)
    sonarContactSfxRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled,
    )
    sonarLoopRef.current?.setVolume(currentAudioSettings.sfxVolume)
    sonarLoopRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled &&
        isPlayerSonarEnabled(currentGame) && currentGame.status === "playing",
    )
    explosionSfxRef.current?.setVolume(currentAudioSettings.sfxVolume)
    explosionSfxRef.current?.setEnabled(
      pageAudioEnabled && currentAudioSettings.sfxEnabled,
    )
  }

  useEffect(() => {
    const backgroundMusic = createBackgroundMusic()
    const deathSfx = createDeathSfx()
    const entityHitSfx = createEntityHitSfx()
    const explosionSfx = createExplosionSfx()
    const movementLoop = createMovementLoop()
    const pickupSfx = createPickupSfx()
    const sonarContactSfx = createSonarContactSfx()
    const sonarLoop = createSonarLoop()
    backgroundMusicRef.current = backgroundMusic
    deathSfxRef.current = deathSfx
    entityHitSfxRef.current = entityHitSfx
    explosionSfxRef.current = explosionSfx
    movementLoopRef.current = movementLoop
    pickupSfxRef.current = pickupSfx
    sonarContactSfxRef.current = sonarContactSfx
    sonarLoopRef.current = sonarLoop

    const startAudio = () => {
      void backgroundMusic.ensureStarted()
      void deathSfx.ensureStarted()
      void entityHitSfx.ensureStarted()
      void explosionSfx.ensureStarted()
      void movementLoop.ensureStarted()
      void pickupSfx.ensureStarted()
      void sonarContactSfx.ensureStarted()
      void sonarLoop.ensureStarted()
    }
    const syncPageAudioEnabled = () => {
      pageAudioEnabledRef.current = isDocumentAudioAllowed(document)
      syncAudioControllers()
    }

    syncAudioControllers()

    window.addEventListener("keydown", startAudio, { passive: true })
    window.addEventListener("pointerdown", startAudio, { passive: true })
    window.addEventListener("focus", syncPageAudioEnabled, { passive: true })
    window.addEventListener("blur", syncPageAudioEnabled, { passive: true })
    document.addEventListener("visibilitychange", syncPageAudioEnabled)

    return () => {
      window.removeEventListener("keydown", startAudio)
      window.removeEventListener("pointerdown", startAudio)
      window.removeEventListener("focus", syncPageAudioEnabled)
      window.removeEventListener("blur", syncPageAudioEnabled)
      document.removeEventListener("visibilitychange", syncPageAudioEnabled)
      backgroundMusicRef.current = null
      deathSfxRef.current = null
      entityHitSfxRef.current = null
      explosionSfxRef.current = null
      movementLoopRef.current = null
      pickupSfxRef.current = null
      sonarContactSfxRef.current = null
      sonarLoopRef.current = null
      backgroundMusic.dispose()
      deathSfx.dispose()
      entityHitSfx.dispose()
      explosionSfx.dispose()
      movementLoop.dispose()
      pickupSfx.dispose()
      sonarContactSfx.dispose()
      sonarLoop.dispose()
    }
  }, [])

  useEffect(() => {
    const persistAppSettings = debounce((nextAppSettings: AppSettings) => {
      writeAppSettings(getBrowserStorage(), nextAppSettings, IS_DEV_BUILD)
    }, SETTINGS_PERSIST_DELAY_MS)
    const dispose = signalEffect(() => {
      persistAppSettings(appSettingsSignal.value)
    })

    return () => {
      dispose()
      writeAppSettings(
        getBrowserStorage(),
        appSettingsSignal.value,
        IS_DEV_BUILD,
      )
    }
  }, [])

  useEffect(() => {
    const nextCounts = new Map<string, number>()

    for (const shockwave of game.shockwaves) {
      if (!shockwave.damaging) {
        continue
      }

      const key =
        `${shockwave.origin.x}:${shockwave.origin.y}:${shockwave.senderId}`
      const nextCount = (nextCounts.get(key) ?? 0) + 1
      nextCounts.set(key, nextCount)

      if (nextCount <= (playedExplosionCountsRef.current.get(key) ?? 0)) {
        continue
      }

      const distance = Math.hypot(
        shockwave.origin.x - game.player.x,
        shockwave.origin.y - game.player.y,
      )
      void explosionSfxRef.current?.playExplosion(distance)
    }

    playedExplosionCountsRef.current = nextCounts
  }, [game])

  useEffect(() => {
    const cueCount = game.playerDeathCueCount ?? 0

    if (cueCount <= playedDeathCueCountRef.current) {
      return
    }

    playedDeathCueCountRef.current = cueCount
    void deathSfxRef.current?.playDeath()
  }, [game.playerDeathCueCount])

  useEffect(() => {
    const cueCount = game.playerEntityHitCueCount ?? 0

    if (cueCount <= playedEntityHitCueCountRef.current) {
      return
    }

    playedEntityHitCueCountRef.current = cueCount
    void entityHitSfxRef.current?.playHit()
  }, [game.playerEntityHitCueCount])

  useEffect(() => {
    const cueCount = game.playerPickupCueCount ?? 0

    if (cueCount <= playedPickupCueCountRef.current) {
      return
    }

    playedPickupCueCountRef.current = cueCount
    void pickupSfxRef.current?.playPickup()
  }, [game.playerPickupCueCount])

  useEffect(() => {
    const cueCount = game.playerSonarContactCueCount ?? 0

    if (cueCount <= playedSonarContactCueCountRef.current) {
      return
    }

    playedSonarContactCueCountRef.current = cueCount
    void sonarContactSfxRef.current?.playContactPing(
      game.playerSonarContactAudioVariant ?? "kizilsungur",
    )
  }, [game.playerSonarContactAudioVariant, game.playerSonarContactCueCount])

  useEffect(() => {
    const cueCount = game.hostileSonarContactCueCount ?? 0

    if (cueCount <= playedHostileSonarContactCueCountRef.current) {
      return
    }

    playedHostileSonarContactCueCountRef.current = cueCount
    void sonarContactSfxRef.current?.playContactPing("kizilsungur")
  }, [game.hostileSonarContactCueCount])

  useEffect(() => {
    syncAudioControllers()
  }, [audioSettings, game.playerSonarEnabled, game.status])

  const startRun = (rawSeed = runSeedSignal.peek()) => {
    void backgroundMusicRef.current?.ensureStarted()
    void deathSfxRef.current?.ensureStarted()
    void entityHitSfxRef.current?.ensureStarted()
    void explosionSfxRef.current?.ensureStarted()
    void movementLoopRef.current?.ensureStarted()
    void pickupSfxRef.current?.ensureStarted()
    void sonarContactSfxRef.current?.ensureStarted()
    void sonarLoopRef.current?.ensureStarted()
    playedEntityHitCueCountRef.current = 0
    playedDeathCueCountRef.current = 0
    playedPickupCueCountRef.current = 0
    playedSonarContactCueCountRef.current = 0
    playedHostileSonarContactCueCountRef.current = 0
    viewportModeSignal.value = "camera"
    const normalizedSeed = parseRunSeed(rawSeed, DEFAULT_SEED).rawSeed
    activeRunSeedSignal.value = normalizedSeed
    runSeedSignal.value = normalizedSeed
    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    hoveredTileSignal.value = null
    resetAutoMoveSeenAnomalies()
    gameSignal.value = createConfiguredGame(normalizedSeed, appSettingsSignal.peek())
  }

  const setViewportModeWithMessage = (nextViewportMode: ViewportMode) => {
    if (viewportModeSignal.peek() === nextViewportMode) {
      return
    }

    viewportModeSignal.value = nextViewportMode
    updateGame((current) => withGameMessage(
      {
        ...current,
      },
      createLogMessage(
        nextViewportMode === "full"
          ? t`Display set to full map.`
          : t`Display set to tracking camera.`,
        "neutral",
        () =>
          nextViewportMode === "full"
            ? t`Display set to full map.`
            : t`Display set to tracking camera.`,
      ),
    ))
  }

  const previewPath = previewTarget ? findAutoMovePath(game, previewTarget) : []

  useEffect(() => {
    if (game.status === "playing") {
      return
    }

    previewTargetSignal.value = null
    autoMoveTargetSignal.value = null
    hoveredTileSignal.value = null
    resetAutoMoveSeenAnomalies()
  }, [game.status])

  useEffect(() => {
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

    const timeoutId = window.setTimeout(() => {
      updateGame((current) => {
        if (current.status !== "playing") {
          autoMoveTargetSignal.value = null
          resetAutoMoveSeenAnomalies()
          return current
        }

        const anomaly = findAutoMoveAnomaly(current)

        if (
          shouldHaltAutoMoveForAnomaly(
            autoMoveSeenAnomaliesRef.current,
            anomaly,
          )
        ) {
          autoMoveSeenAnomaliesRef.current = new Set([
            ...autoMoveSeenAnomaliesRef.current,
            keyForAutoMoveAnomaly(anomaly),
          ])
          autoMoveTargetSignal.value = null
          return withGameMessage(
            {
              ...current,
            },
            createLogMessage(
              createAutoMoveStopMessage(
                anomaly.reason,
                current.player,
                anomaly.point,
              ),
              "warning",
              () => createAutoMoveStopMessage(anomaly.reason, current.player, anomaly.point),
            ),
          )
        }

        const path = findAutoMovePath(current, autoMoveTarget)

        if (path.length < 2) {
          autoMoveTargetSignal.value = null
          clearAutoMoveRoute()
          return withGameMessage(
            {
              ...current,
            },
            createLogMessage(
              createAutoMoveStopMessage(
                "no plotted course",
                current.player,
                autoMoveTarget,
              ),
              "warning",
              () => createAutoMoveStopMessage("no plotted course", current.player, autoMoveTarget),
            ),
          )
        }

        const nextPoint = path[1]

        if (!isPassableTile(tileAt(current.map, nextPoint.x, nextPoint.y))) {
          autoMoveTargetSignal.value = null
          clearAutoMoveRoute()
          return withGameMessage({
            ...current,
          }, createLogMessage(
            createAutoMoveStopMessage("wall ahead", current.player, nextPoint),
            "warning",
            () => createAutoMoveStopMessage("wall ahead", current.player, nextPoint),
          ))
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
          movementLoopRef.current?.markMovement()
        }

        const nextAnomaly = next.status === "playing"
          ? findAutoMoveAnomaly(next)
          : null

        if (
          shouldHaltAutoMoveForAnomaly(
            autoMoveSeenAnomaliesRef.current,
            nextAnomaly,
          )
        ) {
          autoMoveSeenAnomaliesRef.current = new Set([
            ...autoMoveSeenAnomaliesRef.current,
            keyForAutoMoveAnomaly(nextAnomaly),
          ])
          autoMoveTargetSignal.value = null
          return withGameMessage(
            {
              ...next,
            },
            createLogMessage(
              createAutoMoveStopMessage(
                nextAnomaly.reason,
                next.player,
                nextAnomaly.point,
              ),
              "warning",
              () => createAutoMoveStopMessage(nextAnomaly.reason, next.player, nextAnomaly.point),
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

    return () => window.clearTimeout(timeoutId)
  }, [autoMoveTarget, game, isOptionsOpen])

  const handleViewportTileClick = (point: Point) => {
    if (isOptionsOpenSignal.peek()) {
      return
    }

    if (game.status !== "playing") {
      return
    }

    if (!isAutoMoveNavigable(game, point)) {
      previewTargetSignal.value = null
      autoMoveTargetSignal.value = null
      clearAutoMoveRoute()
      updateGame((current) =>
        withGameMessage(
          {
            ...current,
          },
          createLogMessage(
            createAutoMoveStopMessage(
              "charted wall at destination",
              current.player,
              point,
            ),
            "warning",
            () => createAutoMoveStopMessage("charted wall at destination", current.player, point),
          ),
        )
      )
      return
    }

    void backgroundMusicRef.current?.ensureStarted()
    void movementLoopRef.current?.ensureStarted()

    if (previewTarget && pointsEqual(previewTarget, point)) {
      beginAutoMoveRoute(point)
      autoMoveTargetSignal.value = { ...point }
      updateGame((current) =>
        withGameMessage({
          ...current,
        }, createLogMessage(
          t`Auto-nav engaged to ${formatPoint(point)}.`,
          "neutral",
          () => t`Auto-nav engaged to ${formatPoint(point)}.`,
        ))
      )
      return
    }

    const nextPreviewPath = findAutoMovePath(game, point)

    beginAutoMoveRoute(point)
    previewTargetSignal.value = { ...point }
    autoMoveTargetSignal.value = null
    updateGame((current) =>
      withGameMessage(
        {
          ...current,
        },
        nextPreviewPath.length >= 2
          ? createLogMessage(
            t`Course plotted to ${formatPoint(point)}. Click again to engage.`,
            "neutral",
            () => t`Course plotted to ${formatPoint(point)}. Click again to engage.`,
          )
          : createLogMessage(
            createAutoMoveStopMessage(
              "no plotted course",
              current.player,
              point,
            ),
            "warning",
            () => createAutoMoveStopMessage("no plotted course", current.player, point),
          ),
      )
    )
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
        runSeedSignal.value = randomizeRunSeed(
          runSeedSignal.peek(),
          DEFAULT_SEED,
          createRandomSeed(),
        )
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
        startRun()
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
          movementLoopRef.current?.markMovement()
        }

        return next
      })
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

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
    hoveredTile: isGodMode ? hoveredTile : null,
    viewportMode,
    cameraTileWidth: 30,
    cameraTileHeight: 20,
  }
  const viewportLabel = viewportMode === "full" ? t`FULL MAP (M)` : t`TRACKING (M)`
  const hoveredInspectorRows = describeHoveredInspectorRows(game, hoveredTile, {
    revealAllEntities: isGodMode,
  })
  const visibleInspectorRows = filterInspectorRows(hoveredInspectorRows, isGodMode)
  const onOffLabel = (enabled: boolean) => enabled ? t`ON` : t`OFF`

  const handleMusicEnabledChange = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const { checked } = event.currentTarget
    updateAppSettings((current) => ({
      ...current,
      audio: {
        ...current.audio,
        musicEnabled: checked,
      },
    }))
  }

  const handleMusicVolumeInput = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const nextVolume = sliderPercentToLevel(Number(event.currentTarget.value))
    updateAppSettings((current) => ({
      ...current,
      audio: {
        ...current.audio,
        musicVolume: nextVolume,
      },
    }))
  }

  const handleSfxEnabledChange = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const { checked } = event.currentTarget
    updateAppSettings((current) => ({
      ...current,
      audio: {
        ...current.audio,
        sfxEnabled: checked,
      },
    }))
  }

  const handleSfxVolumeInput = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const nextVolume = sliderPercentToLevel(Number(event.currentTarget.value))
    updateAppSettings((current) => ({
      ...current,
      audio: {
        ...current.audio,
        sfxVolume: nextVolume,
      },
    }))
  }

  const handleLanguageChange = (nextLocale: typeof locale) => {
    languageSignal.value = nextLocale
  }

  const handleDevEntityOverlayChange = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    updateAppSettings((current) => ({
      ...current,
      showDevEntityOverlay: event.currentTarget.checked,
    }))
  }

  const handleRevealMapChange = (
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
  }

  const handleRunSeedInput = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    runSeedSignal.value = event.currentTarget.value
  }

  return (
    <main class="game-shell">
      <section class="viewport-stage">
        <FastilesViewport
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

        <section class="sidebar-panel orders-panel">
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
              <span class="sidebar-heading">{t`orders`}</span>
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
          <div class="modal-backdrop" onClick={() => isOptionsOpenSignal.value = false}>
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
                    placeholder={t`seed`}
                    aria-label={t`run seed`}
                    onInput={handleRunSeedInput}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      startRun()
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
                <div class="language-switch" role="group" aria-label={t`language`}>
                  <button
                    type="button"
                    class={`language-switch-button${locale === "en" ? " is-active" : ""}`}
                    aria-pressed={locale === "en"}
                    aria-label={t`English`}
                    onClick={() => handleLanguageChange("en")}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    class={`language-switch-button${locale === "ko" ? " is-active" : ""}`}
                    aria-pressed={locale === "ko"}
                    aria-label={t`Korean`}
                    onClick={() => handleLanguageChange("ko")}
                  >
                    Korean
                  </button>
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
                      onInput={handleMusicVolumeInput}
                    />
                    <input
                      class="audio-toggle"
                      type="checkbox"
                      checked={audioSettings.musicEnabled}
                      aria-label={t`enable music`}
                      onChange={handleMusicEnabledChange}
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
                      onInput={handleSfxVolumeInput}
                    />
                    <input
                      class="audio-toggle"
                      type="checkbox"
                      checked={audioSettings.sfxEnabled}
                      aria-label={t`enable sfx`}
                      onChange={handleSfxEnabledChange}
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
                            onChange={handleRevealMapChange}
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
                            onChange={handleDevEntityOverlayChange}
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
          <div class="modal-backdrop" onClick={() => isOrdersModalOpenSignal.value = false}>
            <section
              class="modal-panel message-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t`orders`}
              onClick={(event) => event.stopPropagation()}
            >
              <div class="panel-header">
                <div class="sidebar-heading">{t`orders`}</div>
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

function createAutoMoveStopMessage(
  reason: string,
  origin: Point,
  point: Point,
): string {
  const bearing = formatBearing(origin, point)
  const localizedReason = localizeAutoMoveReason(reason)

  return t`Auto-nav halted: ${localizedReason} at ${formatPoint(point)}${
    bearing ? ` ${bearing}` : ""
  }.`
}

function formatPoint(point: Point): string {
  return `${point.x},${point.y}`
}

function formatBearing(from: Point, to: Point): string {
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

function getBrowserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage
}
