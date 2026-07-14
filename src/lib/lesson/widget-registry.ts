/**
 * Lesson widget registry — the only interactivity path for lesson content.
 *
 * All renderable widget components must be registered here. An unregistered
 * widget type or a widget whose props fail validation renders a graceful
 * "Content unavailable" fallback — the lesson continues to render around it.
 *
 * Security contract:
 *   - `resolve` never throws; unknown type → null, invalid props → null
 *   - Registry is the sole gateway for interactive components in lesson content
 *   - Widget components never receive unvalidated props
 */

import type React from "react";
import { isCheckpointProps, isFlipCardProps } from "#/types/lesson-document";
import type { CheckpointProps, FlipCardProps } from "#/types/lesson-document";
// Widget components imported for pre-registration (resolved below)
import { CheckpointQuestion } from "#/components/lesson/widgets/CheckpointQuestion";
import { Flipcard } from "#/components/lesson/widgets/Flipcard";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WidgetDefinition<P = unknown> {
  validate: (props: unknown) => props is P;
  component: React.ComponentType<P & { id: string }>;
}

export interface ResolvedWidget<P = unknown> {
  component: React.ComponentType<P & { id: string }>;
  validProps: P;
}

// ─── Registry factory ─────────────────────────────────────────────────────────

function createRegistry() {
  const map = new Map<string, WidgetDefinition>();

  function register<P>(type: string, def: WidgetDefinition<P>): void {
    map.set(type, def as WidgetDefinition);
  }

  function resolve(type: string, props: unknown): ResolvedWidget | null {
    const def = map.get(type);
    if (!def) {
      console.warn("[widget-registry] rejected: unknown type or invalid props", { type, props });
      return null;
    }
    if (!def.validate(props)) {
      console.warn("[widget-registry] rejected: unknown type or invalid props", { type, props });
      return null;
    }
    return { component: def.component, validProps: props };
  }

  return { register, resolve };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const registry = createRegistry();

// Pre-registered widgets
registry.register<CheckpointProps>("checkpoint-question", {
  validate: isCheckpointProps,
  component: CheckpointQuestion as React.ComponentType<CheckpointProps & { id: string }>,
});

registry.register<FlipCardProps>("flipcard", {
  validate: isFlipCardProps,
  component: Flipcard as React.ComponentType<FlipCardProps & { id: string }>,
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a widget type and props to a renderable component + validated props.
 * Returns null if the widget type is unknown or props are invalid.
 * Component code never touches the registry Map directly.
 */
export function resolveWidget(type: string, props: unknown): ResolvedWidget | null {
  return registry.resolve(type, props);
}
