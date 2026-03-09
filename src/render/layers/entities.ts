import type {
  DepthCharge,
  EntityMemoryKind,
  Fish,
  GameState,
  HorizontalDirection,
  HostileSubmarine,
  PickupItem,
  Torpedo,
} from "../../game/game.ts"
import type { Point } from "../../game/mapgen.ts"
import { COLORS } from "../colors.ts"
import { drawTileBackground } from "../helpers/draw.ts"
import { drawGlyph } from "../helpers/draw.ts"
import type { RenderOptions } from "../options.ts"

const torpedoSvgUrl = new URL(
  "../../assets/mobile-torpedo.svg",
  import.meta.url,
).href
const depthChargeSvgUrl = new URL(
  "../../assets/mobile-depth-charge.svg",
  import.meta.url,
).href

type ProjectileIconCache = {
  path: Path2D | null
  status: "idle" | "loading" | "ready" | "error"
}

const projectileIconCaches: Record<
  "torpedo" | "depthCharge",
  ProjectileIconCache
> = {
  torpedo: { path: null, status: "idle" },
  depthCharge: { path: null, status: "idle" },
}

export const colorForHostileSubmarine = (
  hostileSubmarine: HostileSubmarine,
): string => {
  switch (hostileSubmarine.archetype) {
    case "turtle":
      return COLORS.hostileSubmarineTurtle
    case "hunter":
      return COLORS.hostileSubmarineHunter
    case "guard":
      return COLORS.hostileSubmarineGuard
    default:
      return COLORS.hostileSubmarine
  }
}

export const playerGlyphForFacing = (facing: HorizontalDirection): string => {
  return facing === "left" ? "◄" : "►"
}

export const resolveHostileEstimatedPlayerPosition = (
  hostileSubmarine: HostileSubmarine,
): Point | null => {
  const guessedTarget = hostileSubmarine.debugState?.attack.guessedTarget

  if (guessedTarget) {
    return { ...guessedTarget }
  }

  const confirmedPlayerPosition = hostileSubmarine.debugState
    ?.confirmedPlayerPosition

  if (confirmedPlayerPosition) {
    return { ...confirmedPlayerPosition }
  }

  return hostileSubmarine.lastKnownPlayerPosition
    ? { ...hostileSubmarine.lastKnownPlayerPosition }
    : null
}

export const resolveHostileEstimateOverlay = (
  game: GameState,
  hoveredTile: Point | null,
): {
  estimatedPositions: Point[]
  highlightedEstimatedPosition: Point | null
} => {
  const estimatedPositionIndexes = new Set<number>()
  const estimatedPositions: Point[] = []
  const hoveredHostile = hoveredTile
    ? game.hostileSubmarines.find((candidate) =>
      candidate.position.x === hoveredTile.x &&
      candidate.position.y === hoveredTile.y
    )
    : null
  const highlightedEstimatedPosition = hoveredHostile
    ? resolveHostileEstimatedPlayerPosition(hoveredHostile)
    : null

  for (const hostileSubmarine of game.hostileSubmarines) {
    const estimatedPosition = resolveHostileEstimatedPlayerPosition(
      hostileSubmarine,
    )

    if (!estimatedPosition || !pointInBounds(game, estimatedPosition)) {
      continue
    }

    const estimatedIndex = indexForPoint(game, estimatedPosition)

    if (estimatedPositionIndexes.has(estimatedIndex)) {
      continue
    }

    estimatedPositionIndexes.add(estimatedIndex)
    estimatedPositions.push(estimatedPosition)
  }

  return {
    estimatedPositions,
    highlightedEstimatedPosition: highlightedEstimatedPosition &&
        pointInBounds(game, highlightedEstimatedPosition)
      ? highlightedEstimatedPosition
      : null,
  }
}

export type DrawEntitiesLayerOptions = {
  context: CanvasRenderingContext2D
  game: GameState
  renderOptions: RenderOptions
  tileSize: number
  screenX: number
  screenY: number
  x: number
  y: number
  index: number
  entityMaps: {
    torpedoes: Map<number, Torpedo>
    depthCharges: Map<number, DepthCharge>
    boulders: Map<number, { position: { x: number; y: number } }>
    fish: Map<number, Fish>
    hostileSubmarines: Map<number, HostileSubmarine>
    pickups: Map<number, PickupItem>
  }
}

export const drawEntitiesLayer = (
  {
    context,
    game,
    renderOptions,
    tileSize,
    screenX,
    screenY,
    x,
    y,
    index,
    entityMaps,
  }: DrawEntitiesLayerOptions,
): void => {
  const visibility = resolveEntityVisibilityLevel(game, index)
  const entityMemory = game.entityMemory?.[index] ?? null
  const debugOverlayAlpha = renderOptions.debugEntityOverlay ? 0.5 : 0
  const capsuleCollected = game.capsuleCollected ?? false
  const torpedo = entityMaps.torpedoes.get(index)
  const depthCharge = entityMaps.depthCharges.get(index)

  if (x === game.map.spawn.x && y === game.map.spawn.y) {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: COLORS.dockBackground,
      alpha: 1,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: "D",
      color: COLORS.player,
      alpha: 1,
    })
  }

  if (
    !capsuleCollected &&
    x === game.map.capsule.x && y === game.map.capsule.y && game.capsuleKnown
  ) {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: COLORS.capsuleBackground,
      alpha: 1,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: "C",
      color: COLORS.capsule,
      alpha: 1,
    })
  }

  if (visibility === 0) {
    if (debugOverlayAlpha > 0) {
      drawExactEntityOverlay(
        context,
        game,
        tileSize,
        screenX,
        screenY,
        x,
        y,
        index,
        entityMaps,
        debugOverlayAlpha,
      )
    }

    if (x === game.player.x && y === game.player.y) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: playerGlyphForFacing(game.facing),
        color: COLORS.player,
        alpha: 1,
      })
    }

    if (entityMemory) {
      drawEntityMemory(context, screenX, screenY, tileSize, entityMemory)
    }

    if (torpedo && shouldRenderProjectileInDarkness(torpedo.senderId)) {
      drawTorpedoGlyph(context, screenX, screenY, tileSize, torpedo, 1)
    }

    if (depthCharge && shouldRenderProjectileInDarkness(depthCharge.senderId)) {
      drawDepthChargeGlyph(context, screenX, screenY, tileSize, 1)
    }

    return
  }

  const pickup = entityMaps.pickups.get(index)
  if (pickup) {
    const exact = visibility >= 3
    if (exact) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: glyphForPickup(pickup),
        color: colorForPickup(pickup),
        alpha: 1,
      })
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "item")
    }

    if (!exact && debugOverlayAlpha > 0) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: glyphForPickup(pickup),
        color: colorForPickup(pickup),
        alpha: debugOverlayAlpha,
      })
    }
  } else if (entityMemory === "item") {
    drawEntityMemory(context, screenX, screenY, tileSize, entityMemory)
  }

  if (torpedo) {
    const exact = visibility >= 3 || torpedo.senderId === "player"
    if (exact) {
      drawTorpedoGlyph(context, screenX, screenY, tileSize, torpedo, 1)
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "enemy")
    }
  }

  if (depthCharge) {
    drawDepthChargeGlyph(context, screenX, screenY, tileSize, 1)
  }

  const boulder = entityMaps.boulders.get(index)
  if (boulder) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: "O",
      color: COLORS.boulder,
      alpha: 1,
    })
  }

  const fish = entityMaps.fish.get(index)
  if (fish) {
    const exact = visibility >= 3
    if (exact) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: fish.facing === "left" ? "↢" : "↣",
        color: COLORS.fish,
        alpha: 1,
      })
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "non-hostile")
    }

    if (!exact && debugOverlayAlpha > 0) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: fish.facing === "left" ? "↢" : "↣",
        color: COLORS.fish,
        alpha: debugOverlayAlpha,
      })
    }
  }

  const hostileSubmarine = entityMaps.hostileSubmarines.get(index)
  if (hostileSubmarine) {
    const exact = visibility >= 3
    if (exact) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: hostileSubmarine.facing === "left" ? "◄" : "►",
        color: colorForHostileSubmarine(hostileSubmarine),
        alpha: 1,
      })
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "enemy")
    }

    if (!exact && debugOverlayAlpha > 0) {
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: hostileSubmarine.facing === "left" ? "◄" : "►",
        color: colorForHostileSubmarine(hostileSubmarine),
        alpha: debugOverlayAlpha,
      })
    }
  } else if (entityMemory === "enemy") {
    drawEntityMemory(context, screenX, screenY, tileSize, entityMemory)
  }

  if (x === game.player.x && y === game.player.y) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: playerGlyphForFacing(game.facing),
      color: COLORS.player,
      alpha: 1,
    })
  }
}

const glyphForPickup = (pickup: PickupItem): string => {
  switch (pickup.kind) {
    case "torpedo-cache":
      return "T"
    case "depth-charge-cache":
      return "D"
    case "map":
      return "M"
  }
}

const colorForPickup = (pickup: PickupItem): string => {
  switch (pickup.kind) {
    case "torpedo-cache":
      return COLORS.torpedo
    case "depth-charge-cache":
      return COLORS.depthCharge
    case "map":
      return COLORS.pickup
  }
}

const pointInBounds = (game: GameState, point: Point): boolean => {
  return point.x >= 0 && point.x < game.map.width && point.y >= 0 &&
    point.y < game.map.height
}

const indexForPoint = (game: GameState, point: Point): number => {
  return point.y * game.map.width + point.x
}

const drawEntityMemory = (
  context: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number,
  kind: EntityMemoryKind,
): void => {
  const marker = markerForEntityMemory(kind)

  if (marker.backgroundColor) {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: marker.backgroundColor,
      alpha: 1,
    })
  }

  drawGlyph({
    context,
    x: screenX,
    y: screenY,
    tileSize,
    glyph: marker.glyph,
    color: marker.color,
    alpha: 1,
  })
}

export const markerForEntityMemory = (
  kind: EntityMemoryKind,
): { glyph: string; color: string; backgroundColor?: string } => {
  switch (kind) {
    case "item":
      return { glyph: "?", color: COLORS.pickup }
    case "enemy":
      return {
        glyph: "?",
        color: COLORS.enemySonar,
        backgroundColor: COLORS.torpedo,
      }
    case "non-hostile":
      return { glyph: "~", color: COLORS.fish }
  }
}

const drawExactEntityOverlay = (
  context: CanvasRenderingContext2D,
  game: GameState,
  tileSize: number,
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  index: number,
  entityMaps: {
    torpedoes: Map<number, Torpedo>
    depthCharges: Map<number, DepthCharge>
    boulders: Map<number, { position: { x: number; y: number } }>
    fish: Map<number, Fish>
    hostileSubmarines: Map<number, HostileSubmarine>
    pickups: Map<number, PickupItem>
  },
  alpha: number,
): void => {
  if (x === game.map.spawn.x && y === game.map.spawn.y) {
    drawTileBackground({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      color: COLORS.dockBackground,
      alpha,
    })
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: "D",
      color: COLORS.player,
      alpha,
    })
  }

  if (x === game.map.capsule.x && y === game.map.capsule.y) {
    if (!(game.capsuleCollected ?? false)) {
      drawTileBackground({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        color: COLORS.capsuleBackground,
        alpha,
      })
      drawGlyph({
        context,
        x: screenX,
        y: screenY,
        tileSize,
        glyph: "C",
        color: COLORS.capsule,
        alpha,
      })
    }
  }

  const pickup = entityMaps.pickups.get(index)

  if (pickup) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: glyphForPickup(pickup),
      color: colorForPickup(pickup),
      alpha,
    })
  }

  const torpedo = entityMaps.torpedoes.get(index)

  if (torpedo) {
    drawTorpedoGlyph(context, screenX, screenY, tileSize, torpedo, alpha)
  }

  if (entityMaps.depthCharges.has(index)) {
    drawDepthChargeGlyph(context, screenX, screenY, tileSize, alpha)
  }

  if (entityMaps.boulders.has(index)) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: "O",
      color: COLORS.boulder,
      alpha,
    })
  }

  const fish = entityMaps.fish.get(index)

  if (fish) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: fish.facing === "left" ? "<" : ">",
      color: COLORS.fish,
      alpha,
    })
  }

  const hostileSubmarine = entityMaps.hostileSubmarines.get(index)

  if (hostileSubmarine) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: hostileSubmarine.facing === "left" ? "◄" : "►",
      color: colorForHostileSubmarine(hostileSubmarine),
      alpha,
    })
  }
}

export const shouldRenderProjectileInDarkness = (senderId: string): boolean => {
  return senderId === "player"
}

export const resolveEntityVisibilityLevel = (
  game: GameState,
  index: number,
): number => {
  return game.status === "lost" ? 3 : game.visibility[index]
}

const drawTorpedoGlyph = (
  context: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number,
  torpedo: Torpedo,
  alpha: number,
): void => {
  const rotation = torpedo.direction === "left"
    ? 0
    : torpedo.direction === "right"
    ? Math.PI
    : torpedo.direction === "up"
    ? Math.PI / 2
    : -Math.PI / 2

  drawProjectileIcon({
    key: "torpedo",
    url: torpedoSvgUrl,
    context,
    screenX,
    screenY,
    tileSize,
    color: COLORS.torpedo,
    alpha,
    rotation,
  })
}

const drawDepthChargeGlyph = (
  context: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number,
  alpha: number,
): void => {
  drawProjectileIcon({
    key: "depthCharge",
    url: depthChargeSvgUrl,
    context,
    screenX,
    screenY,
    tileSize,
    color: COLORS.depthCharge,
    alpha,
    rotation: 0,
  })
}

type DrawProjectileIconOptions = {
  key: "torpedo" | "depthCharge"
  url: string
  context: CanvasRenderingContext2D
  screenX: number
  screenY: number
  tileSize: number
  color: string
  alpha: number
  rotation: number
}

const drawProjectileIcon = (
  {
    key,
    url,
    context,
    screenX,
    screenY,
    tileSize,
    color,
    alpha,
    rotation,
  }: DrawProjectileIconOptions,
) => {
  const iconPath = getProjectileIconPath(key, url)

  if (!iconPath) {
    drawGlyph({
      context,
      x: screenX,
      y: screenY,
      tileSize,
      glyph: key === "torpedo" ? "•" : "◉",
      color,
      alpha,
    })
    return
  }

  context.save()
  context.globalAlpha = alpha
  context.fillStyle = color
  context.translate(screenX + tileSize / 2, screenY + tileSize / 2)
  context.rotate(rotation)
  context.scale(tileSize / 24, tileSize / 24)
  context.translate(-12, -12)
  context.fill(iconPath)
  context.restore()
}

const getProjectileIconPath = (
  key: "torpedo" | "depthCharge",
  url: string,
): Path2D | null => {
  const cache = projectileIconCaches[key]

  if (cache.status === "ready") {
    return cache.path
  }

  if (
    cache.status === "loading" || cache.status === "error" ||
    typeof DOMParser === "undefined" || typeof Path2D === "undefined"
  ) {
    return null
  }

  cache.status = "loading"
  void fetch(url)
    .then((response) => response.text())
    .then((svg) => {
      const document = new DOMParser().parseFromString(svg, "image/svg+xml")
      const nextPath = new Path2D()

      for (const node of document.querySelectorAll("path")) {
        const d = node.getAttribute("d")

        if (!d) {
          continue
        }

        nextPath.addPath(new Path2D(d))
      }

      cache.path = nextPath
      cache.status = "ready"
      globalThis.dispatchEvent(new Event("resize"))
    })
    .catch(() => {
      cache.status = "error"
    })

  return null
}
