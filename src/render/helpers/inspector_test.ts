import { assertEquals } from "jsr:@std/assert"

import type { GameState } from "../../game/game.ts"
import type { GeneratedMap, Point } from "../../game/mapgen.ts"
import { describeInspectorContact } from "./inspector.ts"

Deno.test("inspector prefers exact fish contact over coarse non-hostile memory", () => {
  const game = createInspectorFishGame()

  assertEquals(describeInspectorContact(game, { x: 4, y: 2 }), "fish")
})

Deno.test("inspector falls back to remembered coarse contact without exact entity", () => {
  const game = createInspectorFishGame()
  const index = 2 * game.map.width + 4
  const withoutFish = {
    ...game,
    fish: [],
    entityMemory: game.entityMemory?.slice() ?? [],
  }

  withoutFish.entityMemory![index] = "non-hostile"

  assertEquals(describeInspectorContact(withoutFish, { x: 4, y: 2 }), "non-hostile")
})

function createInspectorFishGame(): GameState {
  const map = createMapFromRows(
    [
      "########",
      "#......#",
      "#......#",
      "#......#",
      "########",
    ],
    { x: 2, y: 2 },
    { x: 6, y: 2 },
  )

  return {
    map,
    player: { x: 2, y: 2 },
    seed: "inspector-fish-test",
    turn: 0,
    status: "playing",
    playerSonarEnabled: true,
    capsuleKnown: false,
    memory: Array.from({ length: map.tiles.length }, () => null),
    entityMemory: Array.from({ length: map.tiles.length }, () => null),
    visibility: Array.from({ length: map.tiles.length }, () => 0),
    lastSonarTurn: 0,
    playerSonarContactCueCount: 0,
    shockwaves: [],
    shockwaveFront: [],
    torpedoes: [],
    depthCharges: [],
    pickups: [],
    fish: [{
      id: "fish-1",
      position: { x: 4, y: 2 },
      facing: "right",
      mode: "idle",
      target: null,
      idleTurnsRemaining: 1,
      travelTurnsRemaining: 0,
    }],
    hostileSubmarines: [],
    trails: [],
    dust: [],
    cracks: [],
    fallingBoulders: [],
    facing: "right",
    torpedoAmmo: 6,
    depthChargeAmmo: 6,
    screenShake: 0,
    message: "",
    logs: [],
  }
}

function createMapFromRows(
  rows: string[],
  spawn: Point,
  capsule: Point,
): GeneratedMap {
  const width = rows[0].length
  const height = rows.length
  const tiles = rows.flatMap((row) =>
    Array.from(row, (cell) => (cell === "#" ? "wall" : "water" as const))
  )

  return {
    width,
    height,
    tiles,
    spawn,
    capsule,
    seed: "test-map",
    metadata: {
      mainRouteLength: 0,
      smoothingIterations: 0,
      wallProbability: 0,
      topology: 8,
      openTileRatio: 0,
      biomes: ["regular"],
    },
  }
}
