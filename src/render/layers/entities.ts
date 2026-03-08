import type {
  DepthCharge,
  EntityMemoryKind,
  Fish,
  GameState,
  HostileSubmarine,
  PickupItem,
  Torpedo,
} from "../../game/game.ts"
import { COLORS } from "../colors.ts"
import { drawGlyph } from "../helpers/draw.ts"
import type { RenderOptions } from "../options.ts"

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

  if (
    x === game.map.capsule.x && y === game.map.capsule.y && game.capsuleKnown
  ) {
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
        game.facing === "left" ? "◄" : "►",
        COLORS.player,
        1,
      )
    }

    if (entityMemory) {
      drawEntityMemory(context, screenX, screenY, tileSize, entityMemory)
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
      1,
    )
  }

  const depthCharge = entityMaps.depthCharges.get(index)
  if (depthCharge) {
    drawGlyph(context, screenX, screenY, tileSize, "v", COLORS.depthCharge, 1)
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
        COLORS.sonar,
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
        COLORS.hostileSubmarine,
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
        COLORS.hostileSubmarine,
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
        COLORS.hostileSubmarine,
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
      game.facing === "left" ? "◄" : "►",
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

function drawEntityMemory(
  context: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number,
  kind: EntityMemoryKind,
): void {
  const marker = markerForEntityMemory(kind)

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
): { glyph: string; color: string } {
  switch (kind) {
    case "item":
      return { glyph: "?", color: COLORS.pickup }
    case "enemy":
      return { glyph: "!", color: COLORS.hostileSubmarine }
    case "non-hostile":
      return { glyph: "~", color: COLORS.sonar }
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
  if (x === game.map.capsule.x && y === game.map.capsule.y) {
    drawGlyph(context, screenX, screenY, tileSize, "C", COLORS.capsule, alpha)
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
      COLORS.hostileSubmarine,
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
      COLORS.hostileSubmarine,
      alpha,
    )
  }
}
