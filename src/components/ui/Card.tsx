export interface CardProps {
  variant?: "default" | "raised";
  className?: string;
  children: React.ReactNode;
}

/**
 * Base card surface. Uses `--surface` background + `--shadow-card` elevation.
 * `raised` variant (modals, popovers) uses `--surface-raised` + `--shadow-overlay`.
 */
export function Card({ variant = "default", className = "", children }: CardProps) {
  const variantClass = variant === "raised" ? "wp-card wp-card--raised" : "wp-card";
  return <div className={`${variantClass} ${className}`}>{children}</div>;
}
