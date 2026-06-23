export interface GoalProgress {
  totalMl: number
  goalMl: number
  /** Never below 0. */
  remainingMl: number
  /** total / goal, clamped to [0, 1] — drives the ring fill. */
  ratio: number
  /** Math.round(ratio * 100). */
  percent: number
  metGoal: boolean
}

export function goalProgress(totalMl: number, goalMl: number): GoalProgress {
  const safeGoal = Math.max(1, goalMl)
  const clamped = Math.min(1, Math.max(0, totalMl / safeGoal))
  return {
    totalMl,
    goalMl,
    remainingMl: Math.max(0, goalMl - totalMl),
    ratio: clamped,
    percent: Math.round(clamped * 100),
    metGoal: totalMl >= goalMl,
  }
}
