/**
 * Simulated stream driver for dev/test environments.
 *
 * Accepts a full LessonDocumentV1 and progressively reveals sections one at a
 * time, starting from all-null (all skeletons). Used by the fixture route when
 * the `?stream=simulate` query param is present. This gives Playwright a
 * deterministic surface to assert mid-stream state without any real network.
 *
 * Default interval: 200ms → a 7-section lesson completes in ~1.4s.
 * Playwright asserts skeleton at t=0, partial content at t=600ms, complete at t=1400ms.
 */

import { useState, useEffect } from 'react'
import type { LessonDocumentV1, PartialLessonDocument } from '#/types/lesson-document'

interface UseSimulatedStreamOptions {
  delayMs?: number
}

/**
 * Progressive stream simulation hook.
 * Starts with all sections as null (skeletons), then reveals one per interval.
 * Returns a PartialLessonDocument that grows until all sections are real.
 */
export function useSimulatedStream(
  full: LessonDocumentV1,
  options: UseSimulatedStreamOptions = {},
): PartialLessonDocument {
  const { delayMs = 200 } = options

  const [partial, setPartial] = useState<PartialLessonDocument>(() => ({
    ...full,
    sections: full.sections.map(() => null),
  }))

  useEffect(() => {
    // Reset when full doc changes (e.g. fixture swapped in tests)
    setPartial({ ...full, sections: full.sections.map(() => null) })

    let revealed = 0
    const total = full.sections.length

    const id = setInterval(() => {
      if (revealed >= total) {
        clearInterval(id)
        return
      }
      const current = revealed
      setPartial((prev) => {
        const sections = [...prev.sections]
        sections[current] = full.sections[current]
        return { ...prev, sections }
      })
      revealed += 1
      if (revealed >= total) {
        clearInterval(id)
      }
    }, delayMs)

    return () => clearInterval(id)
    // full is a stable constant in the fixture route; stringifying sections would be
    // expensive; we intentionally depend on identity only (the fixture never changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs])

  return partial
}
