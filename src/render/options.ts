export type ViewportMode = "camera" | "full"

export interface RenderOptions {
  debugEntityOverlay?: boolean
  debugPlannedPaths?: boolean
  viewportMode?: ViewportMode
  cameraTileWidth?: number
  cameraTileHeight?: number
}
