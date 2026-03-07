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
  const [seedInput, setSeedInput] = useState(DEFAULT_SEED)
  const [game, setGame] = useState(() => createGame({ seed: DEFAULT_SEED }))
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

  const startRun = (rawSeed: string) => {
    void backgroundMusicRef.current?.ensureStarted()
    const normalizedSeed = rawSeed.trim() || DEFAULT_SEED
    setSeedInput(normalizedSeed)
    setGame(createGame({ seed: normalizedSeed }))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target

      if (target instanceof HTMLInputElement) {
        if (event.key === "Enter") {
          startRun(seedInput || createRandomSeed())
        }

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
  }, [seedInput])

  const sonarIn = ((SONAR_INTERVAL - (game.turn % SONAR_INTERVAL)) % SONAR_INTERVAL) ||
    SONAR_INTERVAL

  return (
    <main class="game-shell">
      <FastilesViewport game={game} />

      <section class="hud hud-top-left">
        <label class="seed-field">
          <span>seed</span>
          <input
            type="text"
            value={seedInput}
            onInput={(event) => setSeedInput(event.currentTarget.value)}
          />
        </label>

        <button
          type="button"
          onClick={() => startRun(seedInput)}
        >
          new run
        </button>
      </section>

      <section class="hud hud-top-right">
        <div>turn {game.turn}</div>
        <div>sonar in {sonarIn}</div>
        <div>payload {game.torpedoesRemaining}</div>
        <div>
          {game.status === "won" ? "capsule secured" : "recover capsule"}
        </div>
      </section>

      <section class="hud hud-bottom-left">
        <div>{game.message}</div>
        <div>move with WASD or arrows</div>
        <div>launch torpedo with Z</div>
        <div>drop depth charge with X</div>
        <div>press R for random run</div>
      </section>

      {game.status === "won"
        ? (
          <section class="hud hud-center">
            <strong>capsule secured</strong>
            <span>press R for a new run</span>
          </section>
        )
        : null}
    </main>
  )
}
