export interface MeterProps {
  /** Progress 0–100 */
  value:      number
  label?:     string
  /** Show percentage text alongside label */
  showValue?: boolean
  className?: string
}

/**
 * Accessible progress meter with ember fill.
 * Transition is gated on `prefers-reduced-motion: no-preference` in CSS.
 * Never uses red for incomplete — ember fill on a neutral track.
 */
export function Meter({ value, label, showValue, className = '' }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div
      className={`wp-meter ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {(label || showValue) && (
        <div className="wp-meter-label">
          {label && <span>{label}</span>}
          {showValue && <span>{clamped}%</span>}
        </div>
      )}
      <div className="wp-meter-track">
        <div
          className="wp-meter-fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
