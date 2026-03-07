/// <reference lib="deno.ns" />

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert"

import {
  type GeneratedMap,
  generateMap,
  isPassableTile,
  mapToAscii,
  type Point,
  tileAt,
} from "./mapgen.ts"

Deno.test("generateMap is deterministic for the same seed", () => {
  const first = generateMap({ width: 48, height: 24, seed: "echo-seed" })
  const second = generateMap({ width: 48, height: 24, seed: "echo-seed" })

  assertEquals(first, second)
})

Deno.test("generateMap is deterministic without an explicit seed", () => {
  const first = generateMap({ width: 48, height: 24 })
  const second = generateMap({ width: 48, height: 24 })

  assertEquals(first, second)
})

Deno.test("generateMap is deterministic for numeric seeds", () => {
  const first = generateMap({ width: 48, height: 24, seed: 12345 })
  const second = generateMap({ width: 48, height: 24, seed: 12345 })

  assertEquals(first, second)
})

Deno.test("generateMap varies layout across different seeds", () => {
  const first = generateMap({ width: 48, height: 24, seed: "alpha" })
  const second = generateMap({ width: 48, height: 24, seed: "bravo" })

  assertNotEquals(mapToAscii(first), mapToAscii(second))
})

Deno.test("spawn and capsule stay in bounds on water tiles", () => {
  const map = generateMap({ width: 52, height: 26, seed: "bounds-check" })

  for (const point of [map.spawn, map.capsule]) {
    assert(point.x > 0 && point.x < map.width - 1)
    assert(point.y > 0 && point.y < map.height - 1)
    assert(isPassableTile(tileAt(map, point.x, point.y)))
  }
})

Deno.test("spawn can reach the capsule across multiple seeds", () => {
  const seeds = [
    "route-1",
    "route-2",
    "route-3",
    "route-4",
    "route-5",
    "route-6",
    "route-7",
    "route-8",
  ]

  for (const seed of seeds) {
    const map = generateMap({ width: 64, height: 28, seed })
    assert(pathExists(map), `expected reachable path for seed ${seed}`)
  }
})

Deno.test("spawn can reach the capsule across minimum and large map sizes", () => {
  const cases = [
    { width: 24, height: 16, seed: "small-map" },
    { width: 32, height: 20, seed: "medium-map" },
    { width: 96, height: 48, seed: "large-map" },
  ]

  for (const testCase of cases) {
    const map = generateMap(testCase)
    assert(
      pathExists(map),
      `expected reachable path for ${JSON.stringify(testCase)}`,
    )
  }
})

Deno.test("solid border stays intact", () => {
  const map = generateMap({ width: 44, height: 22, seed: "border-check" })

  for (let x = 0; x < map.width; x += 1) {
    assertEquals(tileAt(map, x, 0), "wall")
    assertEquals(tileAt(map, x, map.height - 1), "wall")
  }

  for (let y = 0; y < map.height; y += 1) {
    assertEquals(tileAt(map, 0, y), "wall")
    assertEquals(tileAt(map, map.width - 1, y), "wall")
  }
})

function pathExists(map: GeneratedMap): boolean {
  const queue: Point[] = [{ ...map.spawn }]
  const seen = new Set<number>()
  const directions: Point[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      continue
    }

    const index = current.y * map.width + current.x

    if (seen.has(index)) {
      continue
    }

    seen.add(index)

    if (current.x === map.capsule.x && current.y === map.capsule.y) {
      return true
    }

    for (const direction of directions) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }

      if (
        next.x <= 0 || next.x >= map.width - 1 || next.y <= 0 ||
        next.y >= map.height - 1
      ) {
        continue
      }

      if (isPassableTile(tileAt(map, next.x, next.y))) {
        queue.push(next)
      }
    }
  }

  return false
}
