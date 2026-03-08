import { FOV, Lighting } from "npm:rot-js@2.2.1"

import type { GameState } from "../game/game.ts"
import { indexForPoint } from "../game/helpers.ts"
import { tileAt } from "../game/mapgen.ts"
import { collectVentPoints } from "../game/vents.ts"

export interface LightCell {
  color: string
  alpha: number
}

export function buildVentLightMap(game: GameState): Map<number, LightCell> {
  const vents = collectVentPoints(game.map)

  if (vents.length === 0) {
    return new Map<number, LightCell>()
  }

  const lighting = new Lighting(
    (x, y) => reflectivityForTile(tileAt(game.map, x, y)),
    { passes: 1, range: 8 },
  )
  const fov = new FOV.PreciseShadowcasting((x, y) => {
    const tile = tileAt(game.map, x, y)
    return tile !== null && tile !== "wall"
  })

  lighting.setFOV(fov)
  lighting.clearLights()

  for (const vent of vents) {
    lighting.setLight(vent.x, vent.y, [255, 166, 92])
  }

  const lightMap = new Map<number, LightCell>()

  lighting.compute((x, y, color) => {
    if (tileAt(game.map, x, y) !== "vent") {
      return
    }

    const alpha = Number(Math.min(0.22, Math.max(...color) / 255 * 0.2).toFixed(3))

    if (alpha < 0.06) {
      return
    }

    lightMap.set(indexForPoint(game.map.width, { x, y }), {
      color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
      alpha,
    })
  })

  return lightMap
}

function reflectivityForTile(tile: ReturnType<typeof tileAt>): number {
  if (tile === "wall" || tile === null) {
    return 0.06
  }

  if (tile === "kelp") {
    return 0.12
  }

  if (tile === "vent") {
    return 0.24
  }

  return 0.18
}
