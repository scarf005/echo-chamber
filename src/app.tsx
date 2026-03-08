import "./app.css"
import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

import {
  createGame,
  createRandomSeed,
  directionBetweenPoints,
  directionFromKey,
  dropDepthCharge,
  findAutoMoveAnomaly,
  findAutoMovePath,
  fireTorpedo,
  formatGroupedLogMessage,
  groupLogMessages,
  holdPosition,
  isAutoMoveNavigable,
  keyForAutoMoveAnomaly,
  isPlayerSonarEnabled,
  movePlayer,
  revealMap,
  shouldHaltAutoMoveForAnomaly,
  SONAR_INTERVAL,
  togglePlayerSonar,
  withGameMessage,
} from "./game/game.ts"
import type { GameState, HostileSubmarine } from "./game/game.ts"
import { pointsEqual } from "./game/helpers.ts"
import { isPassableTile, type Point, tileAt } from "./game/mapgen.ts"
import { createBackgroundMusic } from "./audio/backgroundMusic.ts"
import { createExplosionSfx } from "./audio/explosionSfx.ts"
import { createMovementLoop } from "./audio/movementLoop.ts"
import { createSonarContactSfx } from "./audio/sonarContactSfx.ts"
import { createSonarLoop } from "./audio/sonarLoop.ts"
import {
  type AudioSettings,
  isDocumentAudioAllowed,
  levelToSliderPercent,
  readAudioSettings,
  sliderPercentToLevel,
  writeAudioSettings,
} from "./audio/settings.ts"
import { FastilesViewport } from "./render/FastilesViewport.tsx"
import { describeInspectorContact } from "./render/helpers/inspector.ts"
import type { RenderOptions } from "./render/options.ts"

const DEFAULT_SEED = "echo-chamber"
const AUTO_MOVE_DELAY_MS = 70
const LOG_PANEL_LINES = 6
const DEV_ENTITY_OVERLAY_STORAGE_KEY = "echo-chamber:dev-entity-overlay"
const IS_DEV_BUILD = import.meta.env.DEV

export function App() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [runSeed, setRunSeed] = useState(DEFAULT_SEED)
  const [game, setGame] = useState(() => createGame({ seed: DEFAULT_SEED }))
  const [previewTarget, setPreviewTarget] = useState<Point | null>(null)
  const [autoMoveTarget, setAutoMoveTarget] = useState<Point | null>(null)
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null)
  const [showDevEntityOverlay, setShowDevEntityOverlay] = useState(() =>
    readDevEntityOverlaySetting(getBrowserStorage())
  )
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readAudioSettings(getBrowserStorage())
  )
  const runSeedRef = useRef(DEFAULT_SEED)
  const isOptionsOpenRef = useRef(false)
  const backgroundMusicRef = useRef<
    ReturnType<typeof createBackgroundMusic> | null
  >(null)
  const explosionSfxRef = useRef<ReturnType<typeof createExplosionSfx> | null>(
    null,
  )
  const movementLoopRef = useRef<ReturnType<typeof createMovementLoop> | null>(
    null,
  )
  const sonarContactSfxRef = useRef<
    ReturnType<typeof createSonarContactSfx> | null
  >(null)
  const sonarLoopRef = useRef<ReturnType<typeof createSonarLoop> | null>(null)
  const playedExplosionCountsRef = useRef<Map<string, number>>(new Map())
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
    movementLoopRef.current?.setVolume(currentAudioSettings.sfxVolume)
    movementLoopRef.current?.setEnabled(
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
    const explosionSfx = createExplosionSfx()
    const movementLoop = createMovementLoop()
    const sonarContactSfx = createSonarContactSfx()
    const sonarLoop = createSonarLoop()
    backgroundMusicRef.current = backgroundMusic
    explosionSfxRef.current = explosionSfx
    movementLoopRef.current = movementLoop
    sonarContactSfxRef.current = sonarContactSfx
    sonarLoopRef.current = sonarLoop

    const startAudio = () => {
      void backgroundMusic.ensureStarted()
      void explosionSfx.ensureStarted()
      void movementLoop.ensureStarted()
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
      explosionSfxRef.current = null
      movementLoopRef.current = null
      sonarContactSfxRef.current = null
      sonarLoopRef.current = null
      backgroundMusic.dispose()
      explosionSfx.dispose()
      movementLoop.dispose()
      sonarContactSfx.dispose()
      sonarLoop.dispose()
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
    const cueCount = game.playerSonarContactCueCount ?? 0

    if (cueCount <= playedSonarContactCueCountRef.current) {
      return
    }

    playedSonarContactCueCountRef.current = cueCount
    void sonarContactSfxRef.current?.playContactPing()
  }, [game.playerSonarContactCueCount])

  useEffect(() => {
    syncAudioControllers()
    writeAudioSettings(getBrowserStorage(), audioSettings)
  }, [audioSettings, game.playerSonarEnabled, game.status])

  useEffect(() => {
    writeDevEntityOverlaySetting(getBrowserStorage(), showDevEntityOverlay)
  }, [showDevEntityOverlay])

  const startRun = (rawSeed = runSeedRef.current) => {
    void backgroundMusicRef.current?.ensureStarted()
    void explosionSfxRef.current?.ensureStarted()
    void movementLoopRef.current?.ensureStarted()
    void sonarContactSfxRef.current?.ensureStarted()
    void sonarLoopRef.current?.ensureStarted()
    playedSonarContactCueCountRef.current = 0
    const normalizedSeed = rawSeed.trim() || DEFAULT_SEED
    runSeedRef.current = normalizedSeed
    setRunSeed(normalizedSeed)
    setPreviewTarget(null)
    setAutoMoveTarget(null)
    setHoveredTile(null)
    resetAutoMoveSeenAnomalies()
    setGame(createGame({ seed: normalizedSeed }))
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
          shouldHaltAutoMoveForAnomaly(autoMoveSeenAnomaliesRef.current, anomaly)
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
            createAutoMoveStopMessage(
              anomaly.reason,
              current.player,
              anomaly.point,
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
            createAutoMoveStopMessage(
              "no plotted course",
              current.player,
              autoMoveTarget,
            ),
          )
        }

        const nextPoint = path[1]

        if (!isPassableTile(tileAt(current.map, nextPoint.x, nextPoint.y))) {
          setAutoMoveTarget(null)
          clearAutoMoveRoute()
          return withGameMessage({
            ...current,
          }, createAutoMoveStopMessage("wall ahead", current.player, nextPoint))
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
            createAutoMoveStopMessage(
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
          createAutoMoveStopMessage(
            "charted wall at destination",
            current.player,
            point,
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
        }, `Auto-nav engaged to ${formatPoint(point)}.`)
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
          ? `Course plotted to ${formatPoint(point)}. Click again to engage.`
          : createAutoMoveStopMessage(
            "no plotted course",
            current.player,
            point,
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

      if (
        target instanceof HTMLElement &&
        target.closest("button, input, textarea, select, a")
      ) {
        return
      }

      if (event.key === "r" || event.key === "R") {
        startRun(createRandomSeed())
        return
      }

      if (event.key === "q" || event.key === "Q") {
        event.preventDefault()
        setGame((current) => togglePlayerSonar(current))
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
  const visibleLogMessages = groupLogMessages(game.logs)
    .slice(-LOG_PANEL_LINES)
    .map(formatGroupedLogMessage)
  const renderOptions: RenderOptions = {
    debugEntityOverlay: IS_DEV_BUILD && showDevEntityOverlay,
    debugPlannedPaths: IS_DEV_BUILD,
  }
  const hoveredInspectorRows = IS_DEV_BUILD
    ? describeHoveredTile(game, hoveredTile)
    : null

  const handleMusicEnabledChange = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const { checked } = event.currentTarget
    setAudioSettings((current) => ({
      ...current,
      musicEnabled: checked,
    }))
  }

  const handleMusicVolumeInput = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const nextVolume = sliderPercentToLevel(Number(event.currentTarget.value))
    setAudioSettings((current) => ({
      ...current,
      musicVolume: nextVolume,
    }))
  }

  const handleSfxEnabledChange = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const { checked } = event.currentTarget
    setAudioSettings((current) => ({
      ...current,
      sfxEnabled: checked,
    }))
  }

  const handleSfxVolumeInput = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    const nextVolume = sliderPercentToLevel(Number(event.currentTarget.value))
    setAudioSettings((current) => ({
      ...current,
      sfxVolume: nextVolume,
    }))
  }

  const handleDevEntityOverlayChange = (
    event: JSX.TargetedEvent<HTMLInputElement>,
  ) => {
    setShowDevEntityOverlay(event.currentTarget.checked)
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
            <span>player sonar</span>
            <strong>{playerSonarEnabled ? "ON" : "OFF"}</strong>
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
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-heading">orders</div>
          <div class="sidebar-text-block">{visibleLogMessages.join("\n")}</div>
        </section>

        {IS_DEV_BUILD
          ? (
            <section class="sidebar-panel">
              <div class="sidebar-heading">inspector</div>
              <div class="stat-row">
                <span>hover tile</span>
                <strong>{hoveredTile ? formatPoint(hoveredTile) : "--"}</strong>
              </div>
              {hoveredInspectorRows
                ? (
                  <div class="dev-inspector-grid">
                    {hoveredInspectorRows.map((row) => (
                      <div class="stat-row" key={row.label}>
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                )
                : (
                  <div class="sidebar-text-block">
                    hover any tile to inspect terrain and entities.
                  </div>
                )}
            </section>
          )
          : null}
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
                  <>
                    <div class="sidebar-heading">dev</div>
                    <div class="button-stack">
                      <button
                        type="button"
                        onClick={() => {
                          setGame((current) =>
                            withGameMessage(revealMap(current), "Dev reveal: full map charted.")
                          )
                          setIsOptionsOpen(false)
                        }}
                      >
                        reveal map
                      </button>
                    </div>
                    <div class="audio-controls">
                      <div class="audio-setting">
                        <span>map overlay</span>
                        <div class="audio-setting-row">
                          <span>
                            show exact entities at 50% opacity
                          </span>
                          <input
                            class="audio-toggle"
                            type="checkbox"
                            checked={showDevEntityOverlay}
                            aria-label="show dev entity overlay"
                            onChange={handleDevEntityOverlayChange}
                          />
                          <strong>{showDevEntityOverlay ? "ON" : "OFF"}</strong>
                        </div>
                      </div>
                    </div>
                  </>
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
                  href="https://freesound.org/people/Department64/sounds/651743/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Underwater Deep Water Loop by Department64 (CC-BY-4.0)
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

function formatVector(vector: Point): string {
  return `${vector.x},${vector.y}`
}

type InspectorRow = {
  label: string
  value: string
}

function describeHostileIntent(hostileSubmarine: HostileSubmarine): string {
  switch (hostileSubmarine.mode) {
    case "retreat":
      return hostileSubmarine.target
        ? `retreating to ${formatPoint(hostileSubmarine.target)}`
        : "retreating"
    case "attack":
      return hostileSubmarine.target
        ? `pressing attack at ${formatPoint(hostileSubmarine.target)}`
        : "pressing attack"
    case "investigate":
      return hostileSubmarine.target
        ? `investigating ${formatPoint(hostileSubmarine.target)}`
        : "investigating"
    case "patrol":
      return hostileSubmarine.target
        ? `holding near ${formatPoint(hostileSubmarine.target)}`
        : "patrolling"
  }
}

function describeHoveredTile(
  game: GameState,
  point: Point | null,
): InspectorRow[] | null {
  if (!point) {
    return null
  }

  const index = point.y * game.map.width + point.x
  const rows: InspectorRow[] = [
    { label: "terrain", value: tileAt(game.map, point.x, point.y) ?? "void" },
    { label: "visibility", value: String(game.visibility[index] ?? 0) },
    { label: "memory", value: game.memory[index] ?? "unknown" },
    { label: "contact", value: describeInspectorContact(game, point) ?? "--" },
  ]

  if (point.x === game.player.x && point.y === game.player.y) {
    rows.push({ label: "entity", value: "player submarine" })
    rows.push({ label: "facing", value: game.facing })
  }

  if (point.x === game.map.capsule.x && point.y === game.map.capsule.y) {
    rows.push({ label: "objective", value: "capsule" })
  }

  const hostileSubmarine = game.hostileSubmarines.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (hostileSubmarine) {
    rows.push({ label: "entity", value: "enemy submarine" })
    rows.push({ label: "enemy id", value: hostileSubmarine.id })
    rows.push({ label: "ai", value: hostileSubmarine.archetype ?? "hunter" })
    rows.push({ label: "mode", value: hostileSubmarine.mode })
    rows.push({
      label: "intent",
      value: describeHostileIntent(hostileSubmarine),
    })
    rows.push({
      label: "initial",
      value: hostileSubmarine.initialPosition
        ? formatPoint(hostileSubmarine.initialPosition)
        : "--",
    })
    rows.push({
      label: "target",
      value: hostileSubmarine.target
        ? formatPoint(hostileSubmarine.target)
        : "--",
    })
    rows.push({
      label: "last known player",
      value: hostileSubmarine.lastKnownPlayerPosition
        ? formatPoint(hostileSubmarine.lastKnownPlayerPosition)
        : "--",
    })
    rows.push({
      label: "player vector",
      value: hostileSubmarine.lastKnownPlayerVector
        ? formatVector(hostileSubmarine.lastKnownPlayerVector)
        : "--",
    })
    rows.push({
      label: "last known turn",
      value: String(hostileSubmarine.lastKnownPlayerTurn ?? "--"),
    })
    rows.push({ label: "reload", value: String(hostileSubmarine.reload) })
    rows.push({
      label: "torpedoes",
      value: String(hostileSubmarine.torpedoAmmo ?? "--"),
    })
    rows.push({ label: "vls", value: String(hostileSubmarine.vlsAmmo ?? "--") })
    rows.push({
      label: "depth charges",
      value: String(hostileSubmarine.depthChargeAmmo ?? "--"),
    })
    rows.push({
      label: "last sonar",
      value: String(hostileSubmarine.lastSonarTurn ?? "--"),
    })
    rows.push({
      label: "planned path",
      value:
        hostileSubmarine.plannedPath && hostileSubmarine.plannedPath.length > 1
          ? hostileSubmarine.plannedPath.map(formatPoint).join(" -> ")
          : "--",
    })
  }

  const pickup = game.pickups.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (pickup) {
    rows.push({ label: "entity", value: "item" })
    rows.push({ label: "item kind", value: pickup.kind })
  }

  const fish = (game.fish ?? []).find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (fish) {
    rows.push({ label: "entity", value: "fish" })
    rows.push({ label: "facing", value: fish.facing })
    rows.push({ label: "mode", value: fish.mode })
    rows.push({ label: "target", value: fish.target ? formatPoint(fish.target) : "--" })
  }

  const torpedo = game.torpedoes.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (torpedo) {
    rows.push({ label: "entity", value: "torpedo" })
    rows.push({ label: "direction", value: torpedo.direction })
    rows.push({ label: "sender", value: torpedo.senderId })
    rows.push({ label: "range", value: String(torpedo.rangeRemaining) })
  }

  const depthCharge = game.depthCharges.find((candidate) =>
    candidate.position.x === point.x && candidate.position.y === point.y
  )

  if (depthCharge) {
    rows.push({ label: "entity", value: "depth charge" })
    rows.push({ label: "sender", value: depthCharge.senderId })
    rows.push({ label: "range", value: String(depthCharge.rangeRemaining) })
  }

  if (
    game.fallingBoulders.some((candidate) =>
      candidate.position.x === point.x && candidate.position.y === point.y
    )
  ) {
    rows.push({ label: "entity", value: "falling boulder" })
  }

  if (game.shockwaveFront.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "shockwave front" })
  }

  if (game.trails.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "bubble trail" })
  }

  if (game.dust.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "dust" })
  }

  if (game.cracks.some((cell) => cell.index === index)) {
    rows.push({ label: "effect", value: "crack" })
  }

  return rows
}

function readDevEntityOverlaySetting(
  storage: Pick<Storage, "getItem"> | null,
): boolean {
  if (!IS_DEV_BUILD || !storage) {
    return IS_DEV_BUILD
  }

  try {
    const raw = storage.getItem(DEV_ENTITY_OVERLAY_STORAGE_KEY)
    return raw === null ? true : raw === "true"
  } catch {
    return true
  }
}

function writeDevEntityOverlaySetting(
  storage: Pick<Storage, "setItem"> | null,
  enabled: boolean,
): void {
  if (!IS_DEV_BUILD || !storage) {
    return
  }

  storage.setItem(DEV_ENTITY_OVERLAY_STORAGE_KEY, String(enabled))
}

function getBrowserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage
}
