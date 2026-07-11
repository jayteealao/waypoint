/**
 * Root lesson renderer.
 *
 * Accepts a full or partial lesson document. Null section slots render as
 * skeletons; populated slots render via LessonSection dispatch. Purely
 * presentational — data fetching and stream wiring live in the route.
 *
 * The article uses .wp-lesson for the 72ch reading measure with Fraunces serif.
 */

import type { LessonDocumentV1, PartialLessonDocument } from '#/types/lesson-document'
import { LessonSection } from './LessonSection'
import { LessonSkeleton } from './LessonSkeleton'

interface LessonViewProps {
  doc: LessonDocumentV1 | PartialLessonDocument
}

export function LessonView({ doc }: LessonViewProps) {
  return (
    <article className="wp-lesson" data-testid="lesson-view">
      <h1 className="display-title" style={{ marginBottom: '0.25rem', fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 }}>
        {doc.title}
      </h1>
      {doc.summary && (
        <p style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-sans)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
          {doc.summary}
        </p>
      )}

      <div className="wp-lesson-sections">
        {doc.sections.map((section, i) =>
          section === null ? (
            <LessonSkeleton key={i} />
          ) : (
            <LessonSection key={section.id} section={section} />
          ),
        )}
      </div>

      {doc.sources.length > 0 && (
        <div className="wp-lesson-sources">
          <p className="wp-lesson-sources-heading">Sources</p>
          <ul className="wp-lesson-sources-list">
            {doc.sources.map((source, i) => (
              <li key={i}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                {source.author && <span style={{ color: 'var(--ink-faint)' }}> — {source.author}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {doc.recommended_primary_source && (
        <div className="wp-lesson-source-block">
          <p className="wp-lesson-source-block-title">Recommended Reading</p>
          <p>
            {doc.recommended_primary_source.url ? (
              <a
                href={doc.recommended_primary_source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="wp-lesson-source-block-link"
              >
                {doc.recommended_primary_source.title}
              </a>
            ) : (
              <span className="wp-lesson-source-block-link">
                {doc.recommended_primary_source.title}
              </span>
            )}
            {doc.recommended_primary_source.author && (
              <span style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-sans)', fontSize: '0.875rem' }}>
                {' '}— {doc.recommended_primary_source.author}
              </span>
            )}
          </p>
        </div>
      )}
    </article>
  )
}
