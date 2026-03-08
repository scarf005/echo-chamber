import { i18n } from "../i18n.ts"
import { indexForPoint } from "./helpers.ts"
import type { CrackCell, FadeCell } from "./model.ts"
import { type GeneratedMap, type Point, tileAt } from "./mapgen.ts"

export function decayCracks(cracks: CrackCell[], amount: number): CrackCell[] {
  return cracks
    .map((crack) => ({
      ...crack,
      alpha: Number((crack.alpha - amount).toFixed(3)),
    }))
    .filter((crack) => crack.alpha > 0.05)
}

export function mergeCrackCells(
  existing: CrackCell[],
  incoming: CrackCell[],
): CrackCell[] {
  let next = existing

  for (const crack of incoming) {
    const found = next.find((entry) => entry.index === crack.index)

    if (found) {
      if (crack.alpha > found.alpha) {
        found.alpha = crack.alpha
        found.glyph = crack.glyph
      }

      continue
    }

    next = [...next, crack]
  }

  return next
}

export function mergeFadeCells(
  cells: FadeCell[],
  incoming: FadeCell[],
): FadeCell[] {
  let next = cells

  for (const cell of incoming) {
    next = mergeFadeCell(next, cell.index, cell.alpha)
  }

  return next
}

export function decayShake(amount: number, shakeDecay: number): number {
  return Math.max(0, Number((amount - shakeDecay).toFixed(3)))
}

export function resolveImpactMessage(
  torpedoImpacts: number,
  depthChargeImpacts: number,
  caveIns: number,
  boulderLandings: number,
): string | null {
  if (caveIns > 0) {
    return "Violent torpedo impact. Cracks race overhead."
  }

  if (boulderLandings > 0) {
    return "Cave-in debris slams through the silt."
  }

  if (torpedoImpacts > 0) {
    return "Violent torpedo impact."
  }

  if (depthChargeImpacts > 0) {
    return "Depth charge detonates below."
  }

  return null
}

export function indexAlphaLookup(cells: FadeCell[]): Map<number, number> {
  return cells.reduce((lookup, cell) => {
    lookup.set(cell.index, Math.max(lookup.get(cell.index) ?? 0, cell.alpha))
    return lookup
  }, new Map<number, number>())
}

export function decayCells(cells: FadeCell[], amount: number): FadeCell[] {
  return cells
    .map((cell) => ({
      ...cell,
      alpha: Number((cell.alpha - amount).toFixed(3)),
    }))
    .filter((cell) => cell.alpha > 0.05)
}

export function decayTrailCells(
  map: GeneratedMap,
  cells: FadeCell[],
  amount: number,
): FadeCell[] {
  return cells.flatMap((cell) => {
    const alpha = Number((cell.alpha - amount).toFixed(3))

    if (alpha < 0.05) {
      return []
    }

    if (cell.drift !== "up") {
      return [{ ...cell, alpha }]
    }

    const point = {
      x: cell.index % map.width,
      y: Math.floor(cell.index / map.width),
    }
    const nextPoint = { x: point.x, y: point.y - 1 }
    const tile = tileAt(map, nextPoint.x, nextPoint.y)

    if (!tile || tile === "wall") {
      return []
    }

    return [{ ...cell, index: indexForPoint(map.width, nextPoint), alpha }]
  })
}

export function mergeFadeCell(
  cells: FadeCell[],
  index: number,
  alpha: number,
): FadeCell[] {
  const existing = cells.find((cell) => cell.index === index)

  if (existing) {
    existing.alpha = Math.max(existing.alpha, alpha)
    return cells
  }

  return [...cells, { index, alpha }]
}

export function mergeTrailCell(
  cells: FadeCell[],
  index: number,
  alpha: number,
  drift?: "up",
  source?: FadeCell["source"],
  visibleToPlayer?: boolean,
): FadeCell[] {
  const existing = cells.find((cell) => cell.index === index)

  if (existing) {
    existing.alpha = Math.max(existing.alpha, alpha)
    existing.drift = drift ?? existing.drift
    existing.source = source ?? existing.source
    existing.visibleToPlayer = existing.visibleToPlayer || visibleToPlayer
    return cells
  }

  return [
    ...cells,
    {
      index,
      alpha,
      ...(drift ? { drift } : {}),
      ...(source ? { source } : {}),
      ...(visibleToPlayer ? { visibleToPlayer } : {}),
    },
  ]
}

export function createDustBurst(
  map: GeneratedMap,
  center: Point,
  alpha: number,
): FadeCell[] {
  const cells: FadeCell[] = []

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const point = {
        x: center.x + offsetX,
        y: center.y + offsetY,
      }
      const tile = tileAt(map, point.x, point.y)

      if (!tile || tile === "wall") {
        continue
      }

      const falloff = Math.max(
        0.32,
        1 - Math.max(Math.abs(offsetX), Math.abs(offsetY)) * 0.35,
      )
      cells.push({
        index: indexForPoint(map.width, point),
        alpha: Number((alpha * falloff).toFixed(3)),
      })
    }
  }

  return cells
}
