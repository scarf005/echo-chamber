import type { GameState } from "./game/game.ts"

export const shouldRestartFromKey = (
  key: string,
  status: GameState["status"],
): boolean => {
  return (key === "r" || key === "R") && status !== "playing"
}
