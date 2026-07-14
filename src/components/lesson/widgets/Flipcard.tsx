/**
 * CSS flip card widget.
 *
 * Click or keyboard (Enter/Space) toggles the card between front and back.
 * Under prefers-reduced-motion: the CSS handles show/hide instead of the
 * 3D rotation, so the interaction semantics are preserved without any transform.
 *
 * Accessibility: button with aria-pressed; front/back faces labelled;
 * keyboard trigger on Enter/Space.
 */

import { useState } from "react";
import type { FlipCardProps } from "#/types/lesson-document";

interface FlipcardProps extends FlipCardProps {
  id: string;
}

export function Flipcard({ id: _id, front, back }: FlipcardProps) {
  const [flipped, setFlipped] = useState(false);

  function toggle() {
    setFlipped((f) => !f);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <div
      className="wp-flipcard"
      data-testid="flipcard"
      aria-pressed={flipped}
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      aria-label={
        flipped
          ? "Card showing answer — click to see question"
          : "Card showing question — click to reveal answer"
      }
    >
      <div className={`wp-flipcard-inner${flipped ? " flipped" : ""}`} data-testid="flipcard-inner">
        <div className="wp-flipcard-front" aria-hidden={flipped}>
          <div>
            <div className="wp-flipcard-label">Question</div>
            <div>{front}</div>
          </div>
        </div>
        <div className="wp-flipcard-back" aria-hidden={!flipped}>
          <div>
            <div className="wp-flipcard-label">Answer</div>
            <div>{back}</div>
          </div>
        </div>
      </div>
      <p className="wp-flipcard-hint" aria-hidden="true">
        {flipped ? "Click to see question" : "Click to reveal answer"}
      </p>
    </div>
  );
}
