interface RingProps {
  ratio: number
  percent: number
  totalMl: number
  goalMl: number
  remainingMl: number
}

/** Accessible progress ring: a real progressbar role + a text fallback inside. */
export function Ring({ ratio, percent, totalMl, goalMl, remainingMl }: RingProps) {
  const size = 220
  const stroke = 16
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = circumference * ratio

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${totalMl} of ${goalMl} millilitres logged, ${percent}% of today's goal`}
      className="relative inline-flex items-center justify-center"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-sky-500 transition-[stroke-dasharray] duration-500 motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold tabular-nums">{totalMl}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">/ {goalMl} ml</span>
        <span className="mt-1 text-xs text-slate-400">
          {remainingMl > 0 ? `${remainingMl} ml to go` : 'Goal met 🎉'}
        </span>
      </div>
    </div>
  )
}
