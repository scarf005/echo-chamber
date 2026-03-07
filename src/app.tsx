import "./app.css"
import { useEffect, useRef, useState } from "preact/hooks"

import {
  createGame,
  createRandomSeed,
  directionFromKey,
  dropDepthCharge,
  fireTorpedo,
  formatGroupedLogMessage,
  groupLogMessages,
  holdPosition,
  movePlayer,
  SONAR_INTERVAL,
} from "./game/game.ts"
import { createBackgroundMusic } from "./audio/backgroundMusic.ts"
import { createMovementLoop } from "./audio/movementLoop.ts"
import { FastilesViewport } from "./render/FastilesViewport.tsx"

const DEFAULT_SEED = "echo-chamber"
const LOG_PANEL_LINES = 6

export function App() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [runSeed, setRunSeed] = useState(DEFAULT_SEED)
  const [game, setGame] = useState(() => createGame({ seed: DEFAULT_SEED }))
  const runSeedRef = useRef(DEFAULT_SEED)
  const isOptionsOpenRef = useRef(false)
  const backgroundMusicRef = useRef<
    ReturnType<typeof createBackgroundMusic> | null
  >(null)
  const movementLoopRef = useRef<ReturnType<typeof createMovementLoop> | null>(
    null,
  )

  useEffect(() => {
    isOptionsOpenRef.current = isOptionsOpen
  }, [isOptionsOpen])

  useEffect(() => {
    const backgroundMusic = createBackgroundMusic()
    const movementLoop = createMovementLoop()
    backgroundMusicRef.current = backgroundMusic
    movementLoopRef.current = movementLoop

    const startAudio = () => {
      void backgroundMusic.ensureStarted()
      void movementLoop.ensureStarted()
    }

    window.addEventListener("keydown", startAudio, { passive: true })
    window.addEventListener("pointerdown", startAudio, { passive: true })

    return () => {
      window.removeEventListener("keydown", startAudio)
      window.removeEventListener("pointerdown", startAudio)
      backgroundMusicRef.current = null
      movementLoopRef.current = null
      backgroundMusic.dispose()
      movementLoop.dispose()
    }
  }, [])

  const startRun = (rawSeed = runSeedRef.current) => {
    void backgroundMusicRef.current?.ensureStarted()
    void movementLoopRef.current?.ensureStarted()
    const normalizedSeed = rawSeed.trim() || DEFAULT_SEED
    runSeedRef.current = normalizedSeed
    setRunSeed(normalizedSeed)
    setGame(createGame({ seed: normalizedSeed }))
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
        setGame((current) => fireTorpedo(current))
        return
      }

      if (event.key === "x" || event.key === "X") {
        event.preventDefault()
        setGame((current) => dropDepthCharge(current))
        return
      }

      if (event.key === ".") {
        event.preventDefault()
        setGame((current) => holdPosition(current))
        return
      }

      const direction = directionFromKey(event.key)

      if (!direction) {
        return
      }

      event.preventDefault()
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
  const visibleLogMessages = groupLogMessages(game.logs)
    .slice(-LOG_PANEL_LINES)
    .map(formatGroupedLogMessage)

  return (
    <main class="game-shell">
      <section class="viewport-stage">
        <FastilesViewport game={game} />
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
              </div>
            </section>
          </div>
        )
        : null}
    </main>
  )
}
