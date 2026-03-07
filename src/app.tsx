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
  movePlayer,
  SONAR_INTERVAL,
  withGameMessage,
} from "./game/game.ts"
import { pointsEqual } from "./game/helpers.ts"
import { isPassableTile, type Point, tileAt } from "./game/mapgen.ts"
import { createBackgroundMusic } from "./audio/backgroundMusic.ts"
import { createExplosionSfx } from "./audio/explosionSfx.ts"
import { createMovementLoop } from "./audio/movementLoop.ts"
import {
  levelToSliderPercent,
  readAudioSettings,
  sliderPercentToLevel,
  writeAudioSettings,
  type AudioSettings,
} from "./audio/settings.ts"
import { FastilesViewport } from "./render/FastilesViewport.tsx"

const DEFAULT_SEED = "echo-chamber"
const AUTO_MOVE_DELAY_MS = 70
const LOG_PANEL_LINES = 6

export function App() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [runSeed, setRunSeed] = useState(DEFAULT_SEED)
  const [game, setGame] = useState(() => createGame({ seed: DEFAULT_SEED }))
  const [previewTarget, setPreviewTarget] = useState<Point | null>(null)
  const [autoMoveTarget, setAutoMoveTarget] = useState<Point | null>(null)
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
  const playedExplosionCountsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    isOptionsOpenRef.current = isOptionsOpen
  }, [isOptionsOpen])

  useEffect(() => {
    const backgroundMusic = createBackgroundMusic()
    const explosionSfx = createExplosionSfx()
    const movementLoop = createMovementLoop()
    backgroundMusicRef.current = backgroundMusic
    explosionSfxRef.current = explosionSfx
    movementLoopRef.current = movementLoop

    const startAudio = () => {
      void backgroundMusic.ensureStarted()
      void explosionSfx.ensureStarted()
      void movementLoop.ensureStarted()
    }

    window.addEventListener("keydown", startAudio, { passive: true })
    window.addEventListener("pointerdown", startAudio, { passive: true })

    return () => {
      window.removeEventListener("keydown", startAudio)
      window.removeEventListener("pointerdown", startAudio)
      backgroundMusicRef.current = null
      explosionSfxRef.current = null
      movementLoopRef.current = null
      backgroundMusic.dispose()
      explosionSfx.dispose()
      movementLoop.dispose()
    }
  }, [])

  useEffect(() => {
    const nextCounts = new Map<string, number>()

    for (const shockwave of game.shockwaves) {
      if (!shockwave.damaging) {
        continue
      }

      const key = `${shockwave.origin.x}:${shockwave.origin.y}:${shockwave.senderId}`
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
    backgroundMusicRef.current?.setVolume(audioSettings.musicVolume)
    backgroundMusicRef.current?.setEnabled(audioSettings.musicEnabled)
    movementLoopRef.current?.setVolume(audioSettings.sfxVolume)
    movementLoopRef.current?.setEnabled(audioSettings.sfxEnabled)
    explosionSfxRef.current?.setVolume(audioSettings.sfxVolume)
    explosionSfxRef.current?.setEnabled(audioSettings.sfxEnabled)
    writeAudioSettings(getBrowserStorage(), audioSettings)
  }, [audioSettings])

  const startRun = (rawSeed = runSeedRef.current) => {
    void backgroundMusicRef.current?.ensureStarted()
    void explosionSfxRef.current?.ensureStarted()
    void movementLoopRef.current?.ensureStarted()
    const normalizedSeed = rawSeed.trim() || DEFAULT_SEED
    runSeedRef.current = normalizedSeed
    setRunSeed(normalizedSeed)
    setPreviewTarget(null)
    setAutoMoveTarget(null)
    setGame(createGame({ seed: normalizedSeed }))
  }

  const previewPath = previewTarget
    ? findAutoMovePath(game, previewTarget)
    : []

  useEffect(() => {
    if (game.status === "playing") {
      return
    }

    setPreviewTarget(null)
    setAutoMoveTarget(null)
  }, [game.status])

  useEffect(() => {
    if (!autoMoveTarget) {
      return
    }

    if (isOptionsOpen || game.status !== "playing") {
      setAutoMoveTarget(null)
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
          return current
        }

        const anomaly = findAutoMoveAnomaly(current)

        if (anomaly) {
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
          return withGameMessage({
            ...current,
          }, createAutoMoveStopMessage("wall ahead", current.player, nextPoint))
        }

        const direction = directionBetweenPoints(path[0], nextPoint)

        if (!direction) {
          setAutoMoveTarget(null)
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

        if (nextAnomaly) {
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
      setAutoMoveTarget({ ...point })
      setGame((current) =>
        withGameMessage({
          ...current,
        }, `Auto-nav engaged to ${formatPoint(point)}.`)
      )
      return
    }

    const nextPreviewPath = findAutoMovePath(game, point)

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

      if (event.key === "z" || event.key === "Z") {
        event.preventDefault()
        setPreviewTarget(null)
        setAutoMoveTarget(null)
        setGame((current) => fireTorpedo(current))
        return
      }

      if (event.key === "x" || event.key === "X") {
        event.preventDefault()
        setPreviewTarget(null)
        setAutoMoveTarget(null)
        setGame((current) => dropDepthCharge(current))
        return
      }

      if (event.key === ".") {
        event.preventDefault()
        setPreviewTarget(null)
        setAutoMoveTarget(null)
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
  const playerCoordinates = formatPoint(game.player)
  const targetCoordinates = previewTarget ? formatPoint(previewTarget) : "--"
  const visibleLogMessages = groupLogMessages(game.logs)
    .slice(-LOG_PANEL_LINES)
    .map(formatGroupedLogMessage)

  return (
    <main class="game-shell">
      <section class="viewport-stage">
        <FastilesViewport
          game={game}
          selectedTarget={previewTarget}
          previewPath={previewPath}
          onTileClick={handleViewportTileClick}
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
            <strong>{sonarIn}</strong>
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
          {visibleLogMessages.map((message, index) => (
            <div class="sidebar-copy" key={`${index}:${message}`}>
              {message}
            </div>
          ))}
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
