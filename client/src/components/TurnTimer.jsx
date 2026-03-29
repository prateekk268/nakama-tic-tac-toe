const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function TurnTimer({ mode, timer, turn }) {
  if (mode !== 'timed') {
    return (
      <div className="timer-card timer-card-static">
        <span className="eyebrow">Turn timer</span>
        <strong>Classic mode</strong>
        <p>No countdown is applied in this room.</p>
      </div>
    )
  }

  const progress = Math.max(0, Math.min(1, timer / 30))
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <div className="timer-card">
      <span className="eyebrow">Turn timer</span>
      <div className="timer-ring">
        <svg viewBox="0 0 120 120">
          <circle className="timer-ring-track" cx="60" cy="60" r={RADIUS} />
          <circle
            className="timer-ring-progress"
            cx="60"
            cy="60"
            r={RADIUS}
            style={{
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: dashOffset,
            }}
          />
        </svg>
        <div className="timer-center">
          <strong>{timer}</strong>
          <span>sec</span>
        </div>
      </div>
      <p>{turn} is on the clock. The server will forfeit them at zero.</p>
    </div>
  )
}
