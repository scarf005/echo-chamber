import "./app.css"
import { effect as signalEffect, signal } from "@preact/signals"
import { debounce } from "@std/async/debounce"
import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

import {
  createGame,
  createLogMessage,
  createRandomSeed,
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
import { FastilesViewport } from "./render/FastilesViewport.tsx"
import {
  describeNotableHostileAiDecision,
  describeHoveredInspectorRows,
  filterInspectorRows,
} from "./render/helpers/inspector.ts"
import type { RenderOptions, ViewportMode } from "./render/options.ts"

const DEFAULT_SEED = "echo-chamber"
const AUTO_MOVE_DELAY_MS = 70
const LOG_PANEL_LINES = 6
const SETTINGS_PERSIST_DELAY_MS = 150
const IS_DEV_BUILD = import.meta.env.DEV
const appSettingsSignal = signal<AppSettings>(
  readAppSettings(getBrowserStorage(), IS_DEV_BUILD),
)
const viewportModeSignal = signal<ViewportMode>("camera")

function shouldRevealDevMap(settings: AppSettings): boolean {
  return IS_DEV_BUILD && settings.revealMap
}

function createConfiguredGame(seed: string, settings: AppSettings) {
  const game = createGame({ seed })
  return shouldRevealDevMap(settings) ? revealMap(game) : game
}

export function App() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [runSeed, setRunSeed] = useState(DEFAULT_SEED)
  const [game, setGame] = useState(() =>
    createConfiguredGame(DEFAULT_SEED, appSettingsSignal.value)
  )
  const [previewTarget, setPreviewTarget] = useState<Point | null>(null)
  const [autoMoveTarget, setAutoMoveTarget] = useState<Point | null>(null)
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null)
  const appSettings = appSettingsSignal.value
  const viewportMode = viewportModeSignal.value
  const audioSettings = appSettings.audio
  const showDevEntityOverlay = appSettings.showDevEntityOverlay
  const isRevealMapEnabled = shouldRevealDevMap(appSettings)
  const isGodMode = IS_DEV_BUILD && showDevEntityOverlay
  const runSeedRef = useRef(DEFAULT_SEED)
  const isOptionsOpenRef = useRef(false)
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
  const autoMoveSeenAnomaliesRef = useRef<Set<string>>(new Set())
  const autoMoveSeenTargetRef = useRef<Point | null>(null)
  const audioSettingsRef = useRef(audioSettings)
  const gameRef = useRef(game)
  const pageAudioEnabledRef = useRef(
    typeof document === "undefined" ? true : isDocumentAudioAllowed(document),
  )

  audioSettingsRef.current = audioSettings
  gameRef.current = game

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
    const currentGame = gameRef.current
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
    isOptionsOpenRef.current = isOptionsOpen
  }, [isOptionsOpen])

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
    syncAudioControllers()
  }, [audioSettings, game.playerSonarEnabled, game.status])

  const startRun = (rawSeed = runSeedRef.current) => {
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
    viewportModeSignal.value = "camera"
    const normalizedSeed = rawSeed.trim() || DEFAULT_SEED
    runSeedRef.current = normalizedSeed
    setRunSeed(normalizedSeed)
    setPreviewTarget(null)
    setAutoMoveTarget(null)
    setHoveredTile(null)
    resetAutoMoveSeenAnomalies()
    setGame(createConfiguredGame(normalizedSeed, appSettingsSignal.peek()))
  }

  const setViewportModeWithMessage = (nextViewportMode: ViewportMode) => {
    if (viewportModeSignal.peek() === nextViewportMode) {
      return
    }

    viewportModeSignal.value = nextViewportMode
    setGame((current) => withGameMessage(
      {
        ...current,
      },
      createLogMessage(
        nextViewportMode === "full"
          ? "Display set to full map."
          : "Display set to tracking camera.",
      ),
    ))
  }

  const previewPath = previewTarget ? findAutoMovePath(game, previewTarget) : []

  useEffect(() => {
    if (game.status === "playing") {
      return
    }

    setPreviewTarget(null)
    setAutoMoveTarget(null)
    setHoveredTile(null)
    resetAutoMoveSeenAnomalies()
  }, [game.status])

  useEffect(() => {
    if (!autoMoveTarget) {
      return
    }

    if (isOptionsOpen) {
      setAutoMoveTarget(null)
      return
    }

    if (game.status !== "playing") {
      setAutoMoveTarget(null)
      resetAutoMoveSeenAnomalies()
      return
    }

    if (pointsEqual(game.player, autoMoveTarget)) {
      setAutoMoveTarget(null)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => {
        if (current.status !== "playing") {
          setAutoMoveTarget(null)
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
          setAutoMoveTarget(null)
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
            ),
          )
        }

        const path = findAutoMovePath(current, autoMoveTarget)

        if (path.length < 2) {
          setAutoMoveTarget(null)
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
            ),
          )
        }

        const nextPoint = path[1]

        if (!isPassableTile(tileAt(current.map, nextPoint.x, nextPoint.y))) {
          setAutoMoveTarget(null)
          clearAutoMoveRoute()
          return withGameMessage({
            ...current,
          }, createLogMessage(
            createAutoMoveStopMessage("wall ahead", current.player, nextPoint),
            "warning",
          ))
        }

        const direction = directionBetweenPoints(path[0], nextPoint)

        if (!direction) {
          setAutoMoveTarget(null)
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
          setAutoMoveTarget(null)
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
            ),
          )
        }

        if (
          !moved || pointsEqual(next.player, autoMoveTarget) ||
          next.status !== "playing"
        ) {
          setAutoMoveTarget(null)
          clearAutoMoveRoute()
        }

        return next
      })
    }, AUTO_MOVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [autoMoveTarget, game, isOptionsOpen])

  const handleViewportTileClick = (point: Point) => {
    if (isOptionsOpenRef.current) {
      return
    }

    if (game.status !== "playing") {
      return
    }

    if (!isAutoMoveNavigable(game, point)) {
      setPreviewTarget(null)
      setAutoMoveTarget(null)
      clearAutoMoveRoute()
      setGame((current) =>
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
          ),
        )
      )
      return
    }

    void backgroundMusicRef.current?.ensureStarted()
    void movementLoopRef.current?.ensureStarted()

    if (previewTarget && pointsEqual(previewTarget, point)) {
      beginAutoMoveRoute(point)
      setAutoMoveTarget({ ...point })
      setGame((current) =>
        withGameMessage({
          ...current,
        }, createLogMessage(`Auto-nav engaged to ${formatPoint(point)}.`))
      )
      return
    }

    const nextPreviewPath = findAutoMovePath(game, point)

    beginAutoMoveRoute(point)
    setPreviewTarget({ ...point })
    setAutoMoveTarget(null)
    setGame((current) =>
      withGameMessage(
        {
          ...current,
        },
        nextPreviewPath.length >= 2
          ? createLogMessage(
            `Course plotted to ${formatPoint(point)}. Click again to engage.`,
          )
          : createLogMessage(
            createAutoMoveStopMessage(
              "no plotted course",
              current.player,
              point,
            ),
            "warning",
          ),
      )
    )
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target

      if (isOptionsOpenRef.current) {
        if (event.key === "Escape") {
          event.preventDefault()
          setIsOptionsOpen(false)
        }

        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        setIsOptionsOpen(true)
        return
      }

      if (
        target instanceof HTMLElement &&
        target.closest("button, input, textarea, select, a")
      ) {
        return
      }

      if (event.key === "q" || event.key === "Q") {
        event.preventDefault()
        setGame((current) => togglePlayerSonar(current))
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
        setPreviewTarget(null)
        setAutoMoveTarget(null)
        clearAutoMoveRoute()
        setGame((current) => fireTorpedo(current))
        return
      }

      if (event.key === "x" || event.key === "X") {
        event.preventDefault()
        setPreviewTarget(null)
        setAutoMoveTarget(null)
        clearAutoMoveRoute()
        setGame((current) => dropDepthCharge(current))
        return
      }

      if (event.key === ".") {
        event.preventDefault()
        setPreviewTarget(null)
        setAutoMoveTarget(null)
        clearAutoMoveRoute()
        setGame((current) => holdPosition(current))
        return
      }

      const direction = directionFromKey(event.key)

      if (!direction) {
        return
      }

      event.preventDefault()
      setPreviewTarget(null)
      setAutoMoveTarget(null)
      resetAutoMoveSeenAnomalies()
      setGame((current) => {
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
  const godModeAiLogMessages = isGodMode
    ? game.hostileSubmarines.flatMap((hostileSubmarine) => {
      const message = describeNotableHostileAiDecision(hostileSubmarine)

      return message ? [createLogMessage(message, "ai")] : []
    })
    : []
  const visibleLogMessages = groupVisibleLogMessages([
    ...game.logs,
    ...godModeAiLogMessages,
  ], isGodMode).slice(-LOG_PANEL_LINES)
  const renderOptions: RenderOptions = {
    debugEntityOverlay: isGodMode,
    debugPlannedPaths: isGodMode,
    viewportMode,
    cameraTileWidth: 30,
    cameraTileHeight: 20,
  }
  const viewportLabel = viewportMode === "full" ? "FULL MAP (M)" : "TRACKING (M)"
  const hoveredInspectorRows = describeHoveredInspectorRows(game, hoveredTile)
  const visibleInspectorRows = filterInspectorRows(hoveredInspectorRows, isGodMode)

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
      setGame((current) => revealMap(current))
    }
  }

  return (
    <main class="game-shell">
      <section class="viewport-stage">
        <FastilesViewport
          game={game}
          selectedTarget={previewTarget}
          previewPath={previewPath}
          onTileClick={handleViewportTileClick}
          onTileHover={setHoveredTile}
          renderOptions={renderOptions}
        />
      </section>

      <aside class="sidebar">
        <section class="sidebar-panel sidebar-panel-primary">
          <div class="panel-header">
            <div class="sidebar-heading">mission status</div>
            <button
              type="button"
              class="icon-button"
              aria-label="open options"
              aria-haspopup="dialog"
              aria-expanded={isOptionsOpen}
              onClick={() => setIsOptionsOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <div class="stat-row">
            <span>turn</span>
            <strong>{game.turn}</strong>
          </div>
          <div class="stat-row">
            <span>sonar in</span>
            <strong>{playerSonarEnabled ? sonarIn : "OFF"}</strong>
          </div>
          <div class="stat-row">
            <span>torpedoes</span>
            <strong>{game.torpedoAmmo}</strong>
          </div>
          <div class="stat-row">
            <span>depth charges</span>
            <strong>{game.depthChargeAmmo}</strong>
          </div>
          <div class="stat-row">
            <span>position</span>
            <strong>{playerCoordinates}</strong>
          </div>
          <div class="stat-row">
            <span>target</span>
            <strong>{targetCoordinates}</strong>
          </div>
          <div class="stat-row">
            <span>display</span>
            <strong>{viewportLabel}</strong>
          </div>
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-heading">orders</div>
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
          <div class="sidebar-heading">inspector</div>
          <div class="stat-row">
            <span>hover tile</span>
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
                hover any tile to inspect terrain and contacts.
              </div>
            )}
        </section>
      </aside>

      {isOptionsOpen
        ? (
          <div class="modal-backdrop" onClick={() => setIsOptionsOpen(false)}>
            <section
              class="modal-panel"
              role="dialog"
              aria-modal="true"
              aria-label="options"
              onClick={(event) => event.stopPropagation()}
            >
              <div class="panel-header">
                <div class="sidebar-heading">options</div>
                <button
                  type="button"
                  class="modal-close"
                  onClick={() => setIsOptionsOpen(false)}
                >
                  close
                </button>
              </div>
              <div class="button-stack">
                <button
                  type="button"
                  onClick={() => {
                    startRun()
                    setIsOptionsOpen(false)
                  }}
                >
                  restart mission
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startRun(createRandomSeed())
                    setIsOptionsOpen(false)
                  }}
                >
                  random run
                </button>
              </div>
              <div class="sidebar-heading">audio</div>
              <div class="audio-controls">
                <div class="audio-setting">
                  <span>music</span>
                  <div class="audio-setting-row">
                    <input
                      class="audio-slider"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={musicVolumePercent}
                      aria-label="music volume"
                      onInput={handleMusicVolumeInput}
                    />
                    <input
                      class="audio-toggle"
                      type="checkbox"
                      checked={audioSettings.musicEnabled}
                      aria-label="enable music"
                      onChange={handleMusicEnabledChange}
                    />
                    <strong>{musicVolumePercent}%</strong>
                  </div>
                </div>
                <div class="audio-setting">
                  <span>sfx</span>
                  <div class="audio-setting-row">
                    <input
                      class="audio-slider"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={sfxVolumePercent}
                      aria-label="sfx volume"
                      onInput={handleSfxVolumeInput}
                    />
                    <input
                      class="audio-toggle"
                      type="checkbox"
                      checked={audioSettings.sfxEnabled}
                      aria-label="enable sfx"
                      onChange={handleSfxEnabledChange}
                    />
                    <strong>{sfxVolumePercent}%</strong>
                  </div>
                </div>
              </div>
              {IS_DEV_BUILD
                ? (
                  <div class="dev-only-block">
                    <div class="sidebar-heading">dev</div>
                    <div class="audio-controls">
                      <div class="audio-setting">
                        <span>map visibility</span>
                        <div class="audio-setting-row">
                          <span>reveal map</span>
                          <input
                            class="audio-toggle"
                            type="checkbox"
                            checked={isRevealMapEnabled}
                            aria-label="reveal map"
                            onChange={handleRevealMapChange}
                          />
                          <strong>{isRevealMapEnabled ? "ON" : "OFF"}</strong>
                        </div>
                      </div>
                      <div class="audio-setting">
                        <span>map overlay</span>
                        <div class="audio-setting-row">
                          <span>
                            god mode
                          </span>
                          <input
                            class="audio-toggle"
                            type="checkbox"
                            checked={showDevEntityOverlay}
                            aria-label="god mode"
                            onChange={handleDevEntityOverlayChange}
                          />
                          <strong>{showDevEntityOverlay ? "ON" : "OFF"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )
                : null}
              <div class="sidebar-heading">credits</div>
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
    </main>
  )
}

function createAutoMoveStopMessage(
  reason: string,
  origin: Point,
  point: Point,
): string {
  const bearing = formatBearing(origin, point)
  return `Auto-nav halted: ${reason} at ${formatPoint(point)}${
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
