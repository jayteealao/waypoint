/**
 * Quick-reply chip bar — tutor-interview slice.
 *
 * Renders the stage-defined chip set alongside the free-text input.
 * Chips are deterministic (not model-generated), so they're usable in tests.
 * Each chip calls `onSelect(label)` when clicked.
 */

import { Chip } from "#/components/ui/Chip";

export interface ChatChipsProps {
  chips: string[];
  onSelect: (label: string) => void;
  disabled?: boolean;
}

export function ChatChips({ chips, onSelect, disabled = false }: ChatChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className="wp-chat-chip-bar"
      data-testid="chat-chips"
      role="group"
      aria-label="Quick replies"
    >
      {chips.map((label) => (
        <Chip
          key={label}
          label={label}
          onClick={disabled ? undefined : () => onSelect(label)}
          className={disabled ? "wp-chip--disabled" : ""}
        />
      ))}
    </div>
  );
}
