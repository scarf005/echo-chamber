import type { Point } from "../game/mapgen.ts"

export type ViewportMode = "camera" | "full"

export interface RenderOptions {
  debugEntityOverlay?: boolean
  debugPlannedPaths?: boolean
  hoveredTile?: Point | null
  viewportMode?: ViewportMode
  cameraTileWidth?: number
  cameraTileHeight?: number
}
