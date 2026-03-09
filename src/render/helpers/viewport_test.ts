/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"

import type { GeneratedMap } from "../../game/mapgen.ts"
import {
  applyCameraZoom,
  CAMERA_ZOOM_STEP_HEIGHT,
  CAMERA_ZOOM_STEP_WIDTH,
  COMPACT_CAMERA_TILE_HEIGHT,
  COMPACT_CAMERA_TILE_WIDTH,
  MAX_CAMERA_TILE_HEIGHT,
  MAX_CAMERA_TILE_WIDTH,
  MIN_CAMERA_TILE_HEIGHT,
  MIN_CAMERA_TILE_WIDTH,
  NARROW_CAMERA_TILE_HEIGHT,
  NARROW_CAMERA_TILE_WIDTH,
  resolveResponsiveCameraTileCounts,
  resolveViewportMetrics,
} from "./viewport.ts"

Deno.test("camera viewport centers on the player when space allows", () => {
  const viewport = resolveViewportMetrics({
    game: createGameStub({
      mapWidth: 80,
      mapHeight: 60,
      playerX: 40,
      playerY: 30,
    }),
    viewportSize: { width: 1200, height: 800 },
    renderOptions: {
      viewportMode: "camera",
      cameraTileWidth: 30,
      cameraTileHeight: 20,
    },
  })

  assertEquals(viewport.left, 25)
  assertEquals(viewport.top, 20)
  assertEquals(viewport.width, 30)
  assertEquals(viewport.height, 20)
  assertEquals(viewport.tileSize, 40)
})

Deno.test("camera viewport clamps at map edges", () => {
  const viewport = resolveViewportMetrics({
    game: createGameStub({
      mapWidth: 80,
      mapHeight: 60,
      playerX: 3,
      playerY: 4,
    }),
    viewportSize: { width: 1200, height: 800 },
    renderOptions: {
      viewportMode: "camera",
      cameraTileWidth: 30,
      cameraTileHeight: 20,
    },
  })

  assertEquals(viewport.left, 0)
  assertEquals(viewport.top, 0)
  assertEquals(viewport.width, 30)
  assertEquals(viewport.height, 20)
})

Deno.test("full map viewport always covers the entire map", () => {
  const viewport = resolveViewportMetrics({
    game: createGameStub({
      mapWidth: 144,
      mapHeight: 84,
      playerX: 70,
      playerY: 30,
    }),
    viewportSize: { width: 960, height: 720 },
    renderOptions: {
      viewportMode: "full",
      cameraTileWidth: 30,
      cameraTileHeight: 20,
    },
  })

  assertEquals(viewport.left, 0)
  assertEquals(viewport.top, 0)
  assertEquals(viewport.width, 144)
  assertEquals(viewport.height, 84)
  assertEquals(viewport.tileSize, 6)
  assertEquals(viewport.cssWidth, 864)
  assertEquals(viewport.cssHeight, 504)
})

Deno.test("responsive camera tiles keep the default view on desktop", () => {
  const cameraTiles = resolveResponsiveCameraTileCounts({
    viewportSize: { width: 1280, height: 800 },
    isCompactLayout: false,
  })

  assertEquals(cameraTiles, {
    width: 30,
    height: 20,
  })
})

Deno.test("responsive camera tiles reduce the camera on compact screens", () => {
  const cameraTiles = resolveResponsiveCameraTileCounts({
    viewportSize: { width: 768, height: 1024 },
    isCompactLayout: true,
  })

  assertEquals(cameraTiles, {
    width: COMPACT_CAMERA_TILE_WIDTH,
    height: COMPACT_CAMERA_TILE_HEIGHT,
  })
})

Deno.test("responsive camera tiles use the narrowest view on phones", () => {
  const cameraTiles = resolveResponsiveCameraTileCounts({
    viewportSize: { width: 390, height: 844 },
    isCompactLayout: true,
  })

  assertEquals(cameraTiles, {
    width: NARROW_CAMERA_TILE_WIDTH,
    height: NARROW_CAMERA_TILE_HEIGHT,
  })
})

Deno.test("camera zoom in reduces visible tile counts", () => {
  const cameraTiles = applyCameraZoom({
    cameraTiles: { width: 18, height: 14 },
    zoomLevel: 2,
  })

  assertEquals(cameraTiles, {
    width: 18 - CAMERA_ZOOM_STEP_WIDTH * 2,
    height: 14 - CAMERA_ZOOM_STEP_HEIGHT * 2,
  })
})

Deno.test("camera zoom out increases visible tile counts", () => {
  const cameraTiles = applyCameraZoom({
    cameraTiles: { width: 18, height: 14 },
    zoomLevel: -2,
  })

  assertEquals(cameraTiles, {
    width: 18 + CAMERA_ZOOM_STEP_WIDTH * 2,
    height: 14 + CAMERA_ZOOM_STEP_HEIGHT * 2,
  })
})

Deno.test("camera zoom clamps to supported bounds", () => {
  const zoomedInTiles = applyCameraZoom({
    cameraTiles: { width: 14, height: 10 },
    zoomLevel: 99,
  })
  const zoomedOutTiles = applyCameraZoom({
    cameraTiles: { width: 30, height: 20 },
    zoomLevel: -99,
  })

  assertEquals(zoomedInTiles, {
    width: MIN_CAMERA_TILE_WIDTH,
    height: MIN_CAMERA_TILE_HEIGHT,
  })
  assertEquals(zoomedOutTiles, {
    width: MAX_CAMERA_TILE_WIDTH,
    height: MAX_CAMERA_TILE_HEIGHT,
  })
})

const createGameStub = (options: {
  mapWidth: number
  mapHeight: number
  playerX: number
  playerY: number
}) => {
  return {
    map: createMapStub(options.mapWidth, options.mapHeight),
    player: {
      x: options.playerX,
      y: options.playerY,
    },
  }
}

const createMapStub = (width: number, height: number): GeneratedMap => {
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
