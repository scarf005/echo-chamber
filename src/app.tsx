import "./app.css"
import { useEffect, useRef, useState } from "preact/hooks"

import {
  createGame,
  createRandomSeed,
  directionFromKey,
  dropDepthCharge,
  fireTorpedo,
  movePlayer,
  SONAR_INTERVAL,
} from "./game/game.ts"
import { createBackgroundMusic } from "./audio/backgroundMusic.ts"
import { FastilesViewport } from "./render/FastilesViewport.tsx"

const DEFAULT_SEED = "echo-chamber"

export function App() {
  const [runSeed, setRunSeed] = useState(DEFAULT_SEED)
  const [game, setGame] = useState(() => createGame({ seed: DEFAULT_SEED }))
  const runSeedRef = useRef(DEFAULT_SEED)
  const backgroundMusicRef = useRef<ReturnType<typeof createBackgroundMusic> | null>(null)

  useEffect(() => {
    const backgroundMusic = createBackgroundMusic()
    backgroundMusicRef.current = backgroundMusic

    const startBackgroundMusic = () => {
      void backgroundMusic.ensureStarted()
    }

    window.addEventListener("keydown", startBackgroundMusic, { passive: true })
    window.addEventListener("pointerdown", startBackgroundMusic, { passive: true })

    return () => {
      window.removeEventListener("keydown", startBackgroundMusic)
      window.removeEventListener("pointerdown", startBackgroundMusic)
      backgroundMusicRef.current = null
      backgroundMusic.dispose()
    }
  }, [])

  const startRun = (rawSeed = runSeedRef.current) => {
    void backgroundMusicRef.current?.ensureStarted()
    const normalizedSeed = rawSeed.trim() || DEFAULT_SEED
    runSeedRef.current = normalizedSeed
    setRunSeed(normalizedSeed)
    setGame(createGame({ seed: normalizedSeed }))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target

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

      const direction = directionFromKey(event.key)

      if (!direction) {
        return
      }

      event.preventDefault()
      setGame((current) => movePlayer(current, direction))
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const sonarIn = ((SONAR_INTERVAL - (game.turn % SONAR_INTERVAL)) % SONAR_INTERVAL) ||
    SONAR_INTERVAL
  const missionStatus = game.status === "won"
    ? "capsule secured"
    : game.status === "lost"
    ? "submarine lost"
    : "recover capsule"

  return (
    <main class="game-shell">
      <section class="viewport-stage">
        <FastilesViewport game={game} />
      </section>

      <aside class="sidebar">
        <section class="sidebar-panel sidebar-panel-primary">
          <div class="sidebar-heading">mission status</div>
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
            <span>objective</span>
            <strong>{missionStatus}</strong>
          </div>
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-heading">command deck</div>
          <div class="button-stack">
            <button type="button" onClick={() => startRun()}>
              restart mission
            </button>
            <button type="button" onClick={() => startRun(createRandomSeed())}>
              random run
            </button>
          </div>
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-heading">orders</div>
          <div class="sidebar-copy">{game.message}</div>
          <div class="sidebar-copy">move with WASD or arrows</div>
          <div class="sidebar-copy">launch torpedo with Z</div>
          <div class="sidebar-copy">drop depth charge with X</div>
          <div class="sidebar-copy">press R for random run</div>
        </section>

        {game.status !== "playing"
          ? (
            <section class="sidebar-panel sidebar-panel-alert">
              <div class="sidebar-heading">mission report</div>
              <strong>{missionStatus}</strong>
              <span>press R or use random run to redeploy</span>
            </section>
          )
          : null}
      </aside>
    </main>
  )
}
