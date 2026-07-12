/**
 * LessonGeneratingView — SSE consumer for live lesson generation.
 *
 * Opens an EventSource to /api/journey/{journeyId}/lesson?waypointId={waypointId}.
 * Receives NDJSON-line SSE events (header, section variants, sources, error) and
 * builds a PartialLessonDocument that is fed to LessonView for progressive rendering.
 *
 * Reconnect behaviour: EventSource auto-reconnects on network failure. onerror fires
 * while the connection is down; onopen fires when it recovers. A ReconnectingBanner is
 * shown during the error window. Already-rendered sections are preserved in React state.
 *
 * Seam: data-testid="lesson-content" wraps the LessonView; data-testid="lesson-error"
 * on the friendly error state; data-testid="lesson-section-N" on individual sections
 * is rendered by LessonSection via LessonView.
 */

import { useEffect, useState } from 'react'
import type { LessonSection as LessonSectionType, LessonSource, PartialLessonDocument } from '#/types/lesson-document'
import { LessonView } from '#/components/lesson/LessonView'
import { LessonSkeleton } from '#/components/lesson/LessonSkeleton'
import { ReconnectingBanner } from './ReconnectingBanner'

export interface LessonGeneratingViewProps {
  journeyId: string
  waypointId: string
  /** Pre-persisted sections from a prior generation (resume path). May be empty. */
  initialSections?: LessonSectionType[]
}

interface DocState {
  title: string
  summary: string
  sections: LessonSectionType[]
  sources: LessonSource[]
  recommended_primary_source: LessonSource | null
  complete: boolean
  error: string | null
}

const INITIAL_DOC: DocState = {
  title: '',
  summary: '',
  sections: [],
  sources: [],
  recommended_primary_source: null,
  complete: false,
  error: null,
}

export function LessonGeneratingView({ journeyId, waypointId, initialSections = [] }: LessonGeneratingViewProps) {
  const [doc, setDoc] = useState<DocState>(() => ({
    ...INITIAL_DOC,
    sections: initialSections,
  }))
  const [reconnecting, setReconnecting] = useState(false)
  // retryCount increments when the user clicks "Try again"; it re-triggers the
  // useEffect below so a new EventSource is opened without a full page reload.
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const url = `/api/journey/${journeyId}/lesson?waypointId=${encodeURIComponent(waypointId)}`
    const es = new EventSource(url)

    es.onopen = () => {
      setReconnecting(false)
    }

    es.onmessage = (ev: MessageEvent<string>) => {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(ev.data) as Record<string, unknown>
      } catch {
        // Non-JSON line — skip (model may emit markdown between NDJSON lines)
        return
      }

      const type = data['type'] as string | undefined

      if (type === 'header') {
        setDoc((prev) => ({
          ...prev,
          title: (data['title'] as string) ?? prev.title,
          summary: (data['summary'] as string) ?? prev.summary,
        }))
      } else if (type === 'sources') {
        const sources = (data['sources'] as LessonSource[]) ?? []
        const rps = (data['recommended_primary_source'] as LessonSource | null) ?? null
        setDoc((prev) => ({
          ...prev,
          sources,
          recommended_primary_source: rps,
          complete: true,
        }))
        es.close()
      } else if (type === 'error') {
        const message = (data['message'] as string) ?? 'Generation failed. Please try again.'
        setDoc((prev) => ({ ...prev, error: message }))
        es.close()
      } else if (type != null) {
        // Section event (prose, code, heading, citation, widget)
        const section = data as unknown as LessonSectionType
        setDoc((prev) => {
          // Guard: skip duplicate section ids (resume sends stored sections first)
          if (prev.sections.some((s) => s.id === section.id)) return prev
          return { ...prev, sections: [...prev.sections, section] }
        })
      }
    }

    es.onerror = () => {
      // onerror fires while the connection is down; EventSource auto-reconnects.
      setReconnecting(true)
    }

    return () => {
      es.close()
    }
  }, [journeyId, waypointId, retryCount])

  // Error state — all fallbacks failed
  if (doc.error) {
    return (
      <div
        className="wp-lesson-error"
        data-testid="lesson-error"
        role="alert"
        style={{ padding: '2rem 1.5rem', textAlign: 'center' }}
      >
        <p style={{ color: 'var(--error)', fontWeight: 600, marginBottom: '0.5rem' }}>
          Generation failed
        </p>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>{doc.error}</p>
        <button
          type="button"
          className="btn-base btn-primary mt-4"
          aria-label="Retry lesson generation"
          onClick={() => {
            setDoc({ ...INITIAL_DOC })
            setRetryCount((c) => c + 1)
          }}
          style={{ marginTop: '1rem' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // Build a PartialLessonDocument for LessonView
  const partial: PartialLessonDocument = {
    version: 1,
    title: doc.title || 'Generating lesson…',
    summary: doc.summary,
    sections: doc.sections,
    sources: doc.sources,
    recommended_primary_source: doc.recommended_primary_source,
  }

  return (
    <div data-testid="lesson-content">
      <ReconnectingBanner visible={reconnecting} />

      {doc.sections.length === 0 && !doc.complete ? (
        // No sections yet — show initial skeleton placeholders
        <article className="wp-lesson">
          <div className="wp-lesson-skeleton-title" aria-hidden="true" />
          <div className="wp-lesson-skeleton-summary" aria-hidden="true" />
          <LessonSkeleton />
          <LessonSkeleton />
          <LessonSkeleton />
        </article>
      ) : (
        <LessonView doc={partial} />
      )}
    </div>
  )
}
