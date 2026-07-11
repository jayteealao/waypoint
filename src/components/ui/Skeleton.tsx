export interface SkeletonProps {
  /** Optional explicit width (e.g. "100%", "12rem") */
  width?:  string | number
  /** Optional explicit height (e.g. "1.25rem", 20) */
  height?: string | number
  className?: string
}

/**
 * Shimmer skeleton placeholder. Reduced-motion uses a static background.
 * `aria-hidden` — purely decorative; the content it replaces supplies semantics.
 */
export function Skeleton({ width, height, className = '' }: SkeletonProps) {
  const style: React.CSSProperties = {}
  if (width  !== undefined) style.width  = typeof width  === 'number' ? `${width}px`  : width
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height

  return (
    <span
      aria-hidden="true"
      className={`wp-skeleton inline-block ${className}`}
      style={style}
    />
  )
}
