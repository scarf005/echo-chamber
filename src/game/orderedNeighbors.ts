import type { Point } from "./mapgen.ts"

type FillOrderedNeighborIndexesOptions = {
  width: number
  height: number
  pointIndex: number
  goal: Point
  neighborIndexes: Int32Array
  neighborScores: Int32Array
}

export const fillOrderedNeighborIndexes = (
  options: FillOrderedNeighborIndexesOptions,
): number => {
  const x = options.pointIndex % options.width
  const y = Math.floor(options.pointIndex / options.width)
  let neighborCount = 0

  const insertNeighbor = (nextIndex: number, nextX: number, nextY: number) => {
    const score = Math.abs(nextX - options.goal.x) +
      Math.abs(nextY - options.goal.y)
    let insertIndex = neighborCount

    while (
      insertIndex > 0 &&
      options.neighborScores[insertIndex - 1] > score
    ) {
      options.neighborIndexes[insertIndex] =
        options.neighborIndexes[insertIndex - 1]
      options.neighborScores[insertIndex] =
        options.neighborScores[insertIndex - 1]
      insertIndex -= 1
    }

    options.neighborIndexes[insertIndex] = nextIndex
    options.neighborScores[insertIndex] = score
    neighborCount += 1
  }

  if (x + 1 < options.width) {
    insertNeighbor(options.pointIndex + 1, x + 1, y)
  }

  if (x > 0) {
    insertNeighbor(options.pointIndex - 1, x - 1, y)
  }

  if (y + 1 < options.height) {
    insertNeighbor(options.pointIndex + options.width, x, y + 1)
  }

  if (y > 0) {
    insertNeighbor(options.pointIndex - options.width, x, y - 1)
  }

  return neighborCount
}
