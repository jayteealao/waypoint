export interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Interactive or static pill chip.
 * When `onClick` is provided, renders as a button with keyboard operability.
 */
export function Chip({ label, selected, onClick, className = "" }: ChipProps) {
  const interactive = !!onClick;

  const baseClass = [
    "wp-chip",
    interactive ? "wp-chip--interactive" : "",
    selected ? "wp-chip--selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={baseClass}>
        {label}
      </button>
    );
  }

  return <span className={baseClass}>{label}</span>;
}
