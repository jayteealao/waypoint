/**
 * Section dispatcher — renders a single LessonSection by type.
 *
 * Security: prose sections flow through sanitizeHtml() before reaching
 * dangerouslySetInnerHTML. Widget sections go through the registry's
 * validation gate — unresolved widgets render a graceful fallback.
 *
 * The sanitizeHtml call is synchronous; the first render uses the escapeHtml
 * fallback until DOMPurify loads on the client (see sanitize.ts).
 */

import type React from 'react'
import type { LessonSection as LessonSectionType } from '#/types/lesson-document'
import { sanitizeHtml } from '#/lib/lesson/sanitize'
import { resolveWidget } from '#/lib/lesson/widget-registry'

interface LessonSectionProps {
  section: LessonSectionType
}

export function LessonSection({ section }: LessonSectionProps) {
  const { id } = section

  switch (section.type) {
    case 'heading':
      return section.level === 2 ? (
        <h2
          className="wp-lesson-heading-2"
          data-testid={`lesson-section-${id}`}
        >
          {section.text}
        </h2>
      ) : (
        <h3
          className="wp-lesson-heading-3"
          data-testid={`lesson-section-${id}`}
        >
          {section.text}
        </h3>
      )

    case 'prose':
      return (
        <div
          className="wp-lesson-prose"
          data-testid={`lesson-section-${id}`}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }}
        />
      )

    case 'code':
      return (
        <div
          className="wp-lesson-code"
          data-testid={`lesson-section-${id}`}
        >
          <pre>
            <code className={`language-${section.language}`}>{section.code}</code>
          </pre>
        </div>
      )

    case 'citation':
      return (
        <blockquote
          className="wp-lesson-citation"
          data-testid={`lesson-section-${id}`}
        >
          <p>{section.quote}</p>
          <p className="wp-lesson-citation-source">
            — {section.url ? (
              <a href={section.url} target="_blank" rel="noopener noreferrer">
                {section.source}
              </a>
            ) : (
              section.source
            )}
          </p>
        </blockquote>
      )

    case 'widget': {
      const resolved = resolveWidget(section.widget_type, section.props)
      if (!resolved) {
        return (
          <div
            role="alert"
            className="wp-lesson-widget-rejected"
            aria-label="Widget unavailable"
            data-testid={`lesson-section-${id}`}
          >
            Content unavailable
          </div>
        )
      }
      // The registry's validate() already confirmed the props are correct for
      // this component type. We cast here because TypeScript cannot carry the
      // generic P across the resolveWidget() call boundary.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const WidgetComponent = resolved.component as React.ComponentType<any>
      return (
        <div data-testid={`lesson-section-${id}`}>
          <WidgetComponent {...(resolved.validProps as Record<string, unknown>)} id={id} />
        </div>
      )
    }

    default:
      // Exhaustiveness guard — TypeScript narrowing ensures this is unreachable
      return null
  }
}
