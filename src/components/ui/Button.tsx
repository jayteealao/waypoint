import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/**
 * Base button primitive. Uses CSS classes from styles.css.
 * All sizes meet the 44px touch-target minimum.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled,
    children,
    className = "",
    ...rest
  },
  ref,
) {
  const variantClass = `btn-${variant}` as const;
  const sizeClass = `btn-${size}` as const;

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn-base ${variantClass} ${sizeClass} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
});
