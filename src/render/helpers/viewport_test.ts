import { assertEquals } from "jsr:@std/assert"

import type { GeneratedMap } from "../../game/mapgen.ts"
import { resolveViewportMetrics } from "./viewport.ts"

Deno.test("camera viewport centers on the player when space allows", () => {
  const viewport = resolveViewportMetrics(
    createGameStub(80, 60, 40, 30),
    { width: 1200, height: 800 },
    {
      viewportMode: "camera",
      cameraTileWidth: 30,
      cameraTileHeight: 20,
    },
  )

  assertEquals(viewport.left, 25)
  assertEquals(viewport.top, 20)
  assertEquals(viewport.width, 30)
  assertEquals(viewport.height, 20)
  assertEquals(viewport.tileSize, 40)
})

Deno.test("camera viewport clamps at map edges", () => {
  const viewport = resolveViewportMetrics(
    createGameStub(80, 60, 3, 4),
    { width: 1200, height: 800 },
    {
      viewportMode: "camera",
      cameraTileWidth: 30,
      cameraTileHeight: 20,
    },
  )

  assertEquals(viewport.left, 0)
  assertEquals(viewport.top, 0)
  assertEquals(viewport.width, 30)
  assertEquals(viewport.height, 20)
})

Deno.test("full map viewport always covers the entire map", () => {
  const viewport = resolveViewportMetrics(
    createGameStub(144, 84, 70, 30),
    { width: 960, height: 720 },
    {
      viewportMode: "full",
      cameraTileWidth: 30,
      cameraTileHeight: 20,
    },
  )

  assertEquals(viewport.left, 0)
  assertEquals(viewport.top, 0)
  assertEquals(viewport.width, 144)
  assertEquals(viewport.height, 84)
  assertEquals(viewport.tileSize, 6)
  assertEquals(viewport.cssWidth, 864)
  assertEquals(viewport.cssHeight, 504)
})

function createGameStub(
  mapWidth: number,
  mapHeight: number,
  playerX: number,
  playerY: number,
) {
  return {
    map: createMapStub(mapWidth, mapHeight),
    player: {
      x: playerX,
      y: playerY,
    },
  }
}

function createMapStub(width: number, height: number): GeneratedMap {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => "water"),
    spawn: { x: 0, y: 0 },
    capsule: { x: width - 1, y: height - 1 },
    seed: "viewport-test",
    metadata: {
      mainRouteLength: 0,
      smoothingIterations: 0,
      wallProbability: 0,
      topology: 8,
      openTileRatio: 1,
      biomes: ["regular"],
    },
  }
}
