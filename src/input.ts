import type { GameState } from "./game/game.ts"

export function shouldRestartFromKey(
  key: string,
  status: GameState["status"],
): boolean {
  return (key === "r" || key === "R") && status !== "playing"
}
