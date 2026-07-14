/**
 * Roadmap schema — roadmap-lesson-generation slice.
 *
 * Defines the TypeScript shape, validation function, and prompt-assembly helper
 * for the roadmap generation path.
 *
 * The model returns a JSON array of WaypointOutput objects (shape mandated by the
 * system prompt); this module validates that shape and provides one re-ask on
 * malformed output before throwing GenerationError.
 */

import type { CapturedRecord } from '#/types/interview'
import type { SourceContent } from '#/lib/source-fetch'
import { buildSourceMaterialBlock } from '#/lib/interview/prompts'

// ── Output type ────────────────────────────────────────────────────────────────

/**
 * Single waypoint as returned by the roadmap model.
 * Persisted to the `waypoints` D1 table via generateRoadmap().
 */
export interface WaypointOutput {
  /** Short, action-oriented milestone title (≤ 60 chars). */
  title: string
  /** What the learner can DO after completing this waypoint. */
  goal: string
  /** 2–5 concept names taught in this waypoint; no duplicates. */
  concepts: string[]
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Thrown by generateRoadmap when the model returns malformed JSON twice.
 */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerationError'
  }
}

/**
 * Validate that the parsed value is a valid WaypointOutput array.
 *
 * Checks:
 * - Value is an array
 * - 1–20 items
 * - Each item has title (string), goal (string), concepts (string[], 1+ items)
 *
 * Returns the validated array on success; throws GenerationError on failure.
 */
export function validateRoadmap(value: unknown): WaypointOutput[] {
  if (!Array.isArray(value)) {
    throw new GenerationError('Roadmap response is not a JSON array')
  }
  if (value.length < 1 || value.length > 20) {
    throw new GenerationError(`Roadmap must have 1–20 waypoints; got ${value.length}`)
  }
  for (let i = 0; i < value.length; i++) {
    const wp = value[i]
    if (typeof wp !== 'object' || wp === null) {
      throw new GenerationError(`Waypoint at index ${i} is not an object`)
    }
    const w = wp as Record<string, unknown>
    if (typeof w.title !== 'string' || !w.title.trim()) {
      throw new GenerationError(`Waypoint at index ${i} missing or empty title`)
    }
    if (typeof w.goal !== 'string' || !w.goal.trim()) {
      throw new GenerationError(`Waypoint at index ${i} missing or empty goal`)
    }
    if (!Array.isArray(w.concepts) || (w.concepts as unknown[]).length < 1) {
      throw new GenerationError(`Waypoint at index ${i} must have at least one concept`)
    }
    if (!(w.concepts as unknown[]).every((c) => typeof c === 'string')) {
      throw new GenerationError(`Waypoint at index ${i} concepts must all be strings`)
    }
  }
  return value as WaypointOutput[]
}

// ── Prompt assembly ────────────────────────────────────────────────────────────

/**
 * Assemble the user message for the roadmap generation call from a captured record.
 * The returned string is injected as the `user` message alongside ROADMAP_SYSTEM_PROMPT.
 *
 * @param capture - Completed interview capture record.
 * @param sourceContent - Optional array of fetched source content to inject as grounding.
 *   When provided and non-empty, a ## Source material block is appended (source-grounding slice).
 */
export function buildRoadmapPrompt(capture: CapturedRecord, sourceContent?: SourceContent[]): string {
  const parts: string[] = ['## Learner profile']

  if (capture.mission) {
    parts.push(`**Mission:** ${capture.mission}`)
  } else {
    parts.push('**Mission:** Not captured — use the stated goal as the mission.')
  }

  if (capture.scope) {
    parts.push(`**Scope / experience level:** ${capture.scope}`)
  }

  if (capture.priorKnowledge) {
    parts.push(`**Prior knowledge:** ${capture.priorKnowledge}`)
  }

  if (capture.sourceUrls.length > 0) {
    parts.push(`**Preferred sources:** ${capture.sourceUrls.join(', ')}`)
  }

  if (capture.bestEffort) {
    parts.push('**Note:** The learner declined detailed probing; generate the best roadmap from the available information.')
  }

  parts.push('\nGenerate the learning roadmap now as a JSON array.')

  const base = parts.join('\n')

  // Append fetched source content block when available (source-grounding slice)
  if (sourceContent && sourceContent.length > 0) {
    return base + buildSourceMaterialBlock(sourceContent)
  }

  return base
}
