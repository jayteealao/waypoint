/**
 * Versioned lesson document schema — v1.
 *
 * This is the 3-slice contract:
 *   - lesson-renderer renders LessonDocumentV1 sections into the reading view
 *   - sample-journey authors fixture lessons against these types
 *   - roadmap-lesson-generation produces LessonDocumentV1 from AI model output
 *   - quiz-fsrs reads checkpoint-question widget props for FSRS concept tagging
 *
 * The `version: 1` discriminant enables additive migration without breaking
 * downstream consumers. Field renames or type narrowings require a version bump.
 */

// ─── Section types ───────────────────────────────────────────────────────────

export interface ProseSection {
  type: 'prose'
  id: string
  /** Inline HTML from model output — must pass through sanitizeHtml() before render */
  html: string
  /** Concepts from the roadmap that this section teaches. Added in roadmap-lesson-generation; optional for backward compat. */
  concept_tags?: string[]
}

export interface CodeSection {
  type: 'code'
  id: string
  language: string
  code: string
  /** Concepts from the roadmap that this section teaches. Optional for backward compat. */
  concept_tags?: string[]
}

export interface HeadingSection {
  type: 'heading'
  id: string
  level: 2 | 3
  text: string
  /** Concepts from the roadmap that this section teaches. Optional for backward compat. */
  concept_tags?: string[]
}

export interface CitationSection {
  type: 'citation'
  id: string
  quote: string
  source: string
  url: string | null
  /** Concepts from the roadmap that this section teaches. Optional for backward compat. */
  concept_tags?: string[]
}

export interface WidgetSection {
  type: 'widget'
  id: string
  widget_type: string
  props: Record<string, unknown>
  /** Concepts from the roadmap that this section teaches. Optional for backward compat. */
  concept_tags?: string[]
}

export type LessonSection =
  | ProseSection
  | CodeSection
  | HeadingSection
  | CitationSection
  | WidgetSection

// ─── Source ──────────────────────────────────────────────────────────────────

export interface LessonSource {
  title: string
  url: string | null
  author: string | null
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface LessonDocumentV1 {
  version: 1
  title: string
  summary: string
  sections: LessonSection[]
  sources: LessonSource[]
  recommended_primary_source: LessonSource | null
}

/**
 * A partially-loaded lesson document where section slots may be null.
 * Used during progressive rendering: null slots render as skeletons.
 */
export interface PartialLessonDocument {
  version: 1
  title: string
  summary: string
  sections: (LessonSection | null)[]
  sources: LessonSource[]
  recommended_primary_source: LessonSource | null
}

// ─── Widget prop types ────────────────────────────────────────────────────────

export interface CheckpointProps {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface FlipCardProps {
  front: string
  back: string
}

// ─── Type guards ─────────────────────────────────────────────────────────────

export function isCheckpointProps(v: unknown): v is CheckpointProps {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p.question === 'string' &&
    Array.isArray(p.options) &&
    (p.options as unknown[]).every((o) => typeof o === 'string') &&
    typeof p.correct_index === 'number' &&
    typeof p.explanation === 'string'
  )
}

export function isFlipCardProps(v: unknown): v is FlipCardProps {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return typeof p.front === 'string' && typeof p.back === 'string'
}
