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

export function colorForHostileSubmarine(hostileSubmarine: HostileSubmarine): string {
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

export function playerGlyphForFacing(facing: HorizontalDirection): string {
  return facing === "left" ? "◄" : "►"
}

export function resolveHostileEstimatedPlayerPosition(
  hostileSubmarine: HostileSubmarine,
): Point | null {
  const guessedTarget = hostileSubmarine.debugState?.attack.guessedTarget

  if (guessedTarget) {
    return { ...guessedTarget }
  }

  const confirmedPlayerPosition = hostileSubmarine.debugState?.confirmedPlayerPosition

  if (confirmedPlayerPosition) {
    return { ...confirmedPlayerPosition }
  }

  return hostileSubmarine.lastKnownPlayerPosition
    ? { ...hostileSubmarine.lastKnownPlayerPosition }
    : null
}

export function resolveHostileEstimateOverlay(
  game: GameState,
  hoveredTile: Point | null,
): {
  estimatedPositions: Point[]
  highlightedEstimatedPosition: Point | null
} {
  const estimatedPositionIndexes = new Set<number>()
  const estimatedPositions: Point[] = []
  const hoveredHostile = hoveredTile
    ? game.hostileSubmarines.find((candidate) =>
      candidate.position.x === hoveredTile.x && candidate.position.y === hoveredTile.y
    )
    : null
  const highlightedEstimatedPosition = hoveredHostile
    ? resolveHostileEstimatedPlayerPosition(hoveredHostile)
    : null

  for (const hostileSubmarine of game.hostileSubmarines) {
    const estimatedPosition = resolveHostileEstimatedPlayerPosition(hostileSubmarine)

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
    highlightedEstimatedPosition:
      highlightedEstimatedPosition && pointInBounds(game, highlightedEstimatedPosition)
        ? highlightedEstimatedPosition
        : null,
  }
}

export function drawEntitiesLayer(
  context: CanvasRenderingContext2D,
  game: GameState,
  renderOptions: RenderOptions,
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
): void {
  const visibility = game.visibility[index]
  const entityMemory = game.entityMemory?.[index] ?? null
  const debugOverlayAlpha = renderOptions.debugEntityOverlay ? 0.5 : 0
  const capsuleCollected = game.capsuleCollected ?? false
  const torpedo = entityMaps.torpedoes.get(index)
  const depthCharge = entityMaps.depthCharges.get(index)

  if (x === game.map.spawn.x && y === game.map.spawn.y) {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      COLORS.dockBackground,
      1,
    )
    drawGlyph(context, screenX, screenY, tileSize, "D", COLORS.player, 1)
  }

  if (
    !capsuleCollected &&
    x === game.map.capsule.x && y === game.map.capsule.y && game.capsuleKnown
  ) {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      COLORS.capsuleBackground,
      1,
    )
    drawGlyph(context, screenX, screenY, tileSize, "C", COLORS.capsule, 1)
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
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        playerGlyphForFacing(game.facing),
        COLORS.player,
        1,
      )
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
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        glyphForPickup(pickup),
        colorForPickup(pickup),
        1,
      )
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "item")
    }

    if (!exact && debugOverlayAlpha > 0) {
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        glyphForPickup(pickup),
        colorForPickup(pickup),
        debugOverlayAlpha,
      )
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
    drawGlyph(context, screenX, screenY, tileSize, "O", COLORS.boulder, 1)
  }

  const fish = entityMaps.fish.get(index)
  if (fish) {
    const exact = visibility >= 3
    if (exact) {
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        fish.facing === "left" ? "<" : ">",
        COLORS.fish,
        1,
      )
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "non-hostile")
    }

    if (!exact && debugOverlayAlpha > 0) {
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        fish.facing === "left" ? "<" : ">",
        COLORS.fish,
        debugOverlayAlpha,
      )
    }
  }

  const hostileSubmarine = entityMaps.hostileSubmarines.get(index)
  if (hostileSubmarine) {
    const exact = visibility >= 3
    if (exact) {
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        hostileSubmarine.facing === "left" ? "◄" : "►",
        colorForHostileSubmarine(hostileSubmarine),
        1,
      )
    } else {
      drawEntityMemory(context, screenX, screenY, tileSize, "enemy")
    }

    if (!exact && debugOverlayAlpha > 0) {
      drawGlyph(
        context,
        screenX,
        screenY,
        tileSize,
        hostileSubmarine.facing === "left" ? "◄" : "►",
        colorForHostileSubmarine(hostileSubmarine),
        debugOverlayAlpha,
      )
    }
  } else if (entityMemory === "enemy") {
    drawEntityMemory(context, screenX, screenY, tileSize, entityMemory)
  }

  if (x === game.player.x && y === game.player.y) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      playerGlyphForFacing(game.facing),
      COLORS.player,
      1,
    )
  }
}

function glyphForPickup(pickup: PickupItem): string {
  switch (pickup.kind) {
    case "torpedo-cache":
      return "T"
    case "depth-charge-cache":
      return "D"
    case "map":
      return "M"
  }
}

function colorForPickup(pickup: PickupItem): string {
  switch (pickup.kind) {
    case "torpedo-cache":
      return COLORS.torpedo
    case "depth-charge-cache":
      return COLORS.depthCharge
    case "map":
      return COLORS.pickup
  }
}

function pointInBounds(game: GameState, point: Point): boolean {
  return point.x >= 0 && point.x < game.map.width && point.y >= 0 && point.y < game.map.height
}

function indexForPoint(game: GameState, point: Point): number {
  return point.y * game.map.width + point.x
}

function drawEntityMemory(
  context: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number,
  kind: EntityMemoryKind,
): void {
  const marker = markerForEntityMemory(kind)

  if (marker.backgroundColor) {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      marker.backgroundColor,
      1,
    )
  }

  drawGlyph(
    context,
    screenX,
    screenY,
    tileSize,
    marker.glyph,
    marker.color,
    1,
  )
}

export function markerForEntityMemory(
  kind: EntityMemoryKind,
): { glyph: string; color: string; backgroundColor?: string } {
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

function drawExactEntityOverlay(
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
): void {
  if (x === game.map.spawn.x && y === game.map.spawn.y) {
    drawTileBackground(
      context,
      screenX,
      screenY,
      tileSize,
      COLORS.dockBackground,
      alpha,
    )
    drawGlyph(context, screenX, screenY, tileSize, "D", COLORS.player, alpha)
  }

  if (x === game.map.capsule.x && y === game.map.capsule.y) {
    if (!(game.capsuleCollected ?? false)) {
      drawTileBackground(
        context,
        screenX,
        screenY,
        tileSize,
        COLORS.capsuleBackground,
        alpha,
      )
      drawGlyph(context, screenX, screenY, tileSize, "C", COLORS.capsule, alpha)
    }
  }

  const pickup = entityMaps.pickups.get(index)

  if (pickup) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      glyphForPickup(pickup),
      colorForPickup(pickup),
      alpha,
    )
  }

  const torpedo = entityMaps.torpedoes.get(index)

  if (torpedo) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      torpedo.direction === "left"
        ? "<"
        : torpedo.direction === "right"
        ? ">"
        : torpedo.direction === "up"
        ? "^"
        : "v",
      COLORS.torpedo,
      alpha,
    )
  }

  if (entityMaps.depthCharges.has(index)) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      "v",
      COLORS.depthCharge,
      alpha,
    )
  }

  if (entityMaps.boulders.has(index)) {
    drawGlyph(context, screenX, screenY, tileSize, "O", COLORS.boulder, alpha)
  }

  const fish = entityMaps.fish.get(index)

  if (fish) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      fish.facing === "left" ? "<" : ">",
      COLORS.fish,
      alpha,
    )
  }

  const hostileSubmarine = entityMaps.hostileSubmarines.get(index)

  if (hostileSubmarine) {
    drawGlyph(
      context,
      screenX,
      screenY,
      tileSize,
      hostileSubmarine.facing === "left" ? "◄" : "►",
      colorForHostileSubmarine(hostileSubmarine),
      alpha,
    )
  }
}
