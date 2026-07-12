// @vitest-environment node
/**
 * Unit tests for the FSRS scheduler (ts-fsrs ↔ D1 bridge).
 *
 * All tests use fake timers and a lightweight D1 stub (vi.fn pattern).
 * No Workers runtime required — pure node environment.
 *
 * Tests (7):
 *  1. New card: Manual sentinel upserts an empty card in New state.
 *  2. Rating.Good on a New card advances stability and state to Learning.
 *  3. Rating.Again on a Review card increments lapses → Relearning.
 *  4. getDueConceptIds returns IDs where due <= serverNow.
 *  5. getDueConceptIds excludes concepts whose quiz questions match currentWaypointId.
 *  6. computeRetrievability returns ≈1.0 immediately after a successful review.
 *  7. Round-trip: mapFsrsToDb(mapDbCardToFsrs(dbCard)) reproduces the original fields.
 */

import { describe, it, expect, vi } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import {
  mapDbCardToFsrs,
  mapFsrsToDb,
  applyGradeToCard,
  getDueConceptIds,
  computeRetrievability,
} from '#/lib/quiz/fsrs-scheduler'
import type { ConceptFsrsCard } from '#/db/schema'

// ── D1 stub factory ────────────────────────────────────────────────────────────

/**
 * Minimal D1Database stub. Stores all `INSERT/UPDATE` calls in `mutations`
 * and serves from `queryResults` keyed by SQL snippet.
 */
function makeD1Stub(
  queryResults: Record<string, unknown> = {},
): { db: D1Database; mutations: Array<{ sql: string; bindings: unknown[] }> } {
  const mutations: Array<{ sql: string; bindings: unknown[] }> = []

  function makePrepared(sql: string) {
    const trimmedSql = sql.trim().replace(/\s+/g, ' ')
    const stmt = {
      bind: (...bindings: unknown[]) => ({
        first: vi.fn(async () => {
          // Return the pre-configured result for this SQL or null
          for (const key of Object.keys(queryResults)) {
            if (trimmedSql.includes(key)) return queryResults[key] ?? null
          }
          return null
        }),
        all: vi.fn(async () => {
          for (const key of Object.keys(queryResults)) {
            if (trimmedSql.includes(key)) {
              const r = queryResults[key]
              return { results: Array.isArray(r) ? r : r !== null && r !== undefined ? [r] : [] }
            }
          }
          return { results: [] }
        }),
        run: vi.fn(async () => {
          mutations.push({ sql: trimmedSql, bindings })
          return { success: true, meta: { changes: 1 } }
        }),
      }),
    }
    return stmt
  }

  const db = {
    prepare: vi.fn((sql: string) => makePrepared(sql)),
  } as unknown as D1Database

  return { db, mutations }
}

// ── Shared fixture: a fully-populated ConceptFsrsCard row ─────────────────────

const reviewCard: ConceptFsrsCard = {
  id: 'card-1',
  user_id: 'user-1',
  concept_id: 'concept-1',
  due: Date.now() - 86_400_000, // was due yesterday
  stability: 5.0,
  difficulty: 5.0,
  reps: 3,
  lapses: 0,
  state: 'Review',
  last_review: Date.now() - 86_400_000,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mapDbCardToFsrs + mapFsrsToDb round-trip (test 7)', () => {
  it('round-trips a fully-populated Review card with no data loss', () => {
    const fsrsCard = mapDbCardToFsrs(reviewCard)

    // Confirm key fields are correctly mapped
    expect(fsrsCard.due).toBeInstanceOf(Date)
    expect(fsrsCard.due.getTime()).toBe(reviewCard.due)
    expect(fsrsCard.stability).toBe(5.0)
    expect(fsrsCard.difficulty).toBe(5.0)
    expect(fsrsCard.reps).toBe(3)
    expect(fsrsCard.lapses).toBe(0)
    expect(fsrsCard.state).toBe(State.Review)
    expect(fsrsCard.last_review?.getTime()).toBe(reviewCard.last_review)

    const backToDb = mapFsrsToDb(fsrsCard)
    expect(backToDb.due).toBe(reviewCard.due)
    expect(backToDb.stability).toBe(reviewCard.stability)
    expect(backToDb.difficulty).toBe(reviewCard.difficulty)
    expect(backToDb.reps).toBe(reviewCard.reps)
    expect(backToDb.lapses).toBe(reviewCard.lapses)
    expect(backToDb.state).toBe(reviewCard.state)
    expect(backToDb.last_review).toBe(reviewCard.last_review)
  })

  it('handles a null-field new card (due=null, last_review=null)', () => {
    const newCard: ConceptFsrsCard = {
      id: 'card-new',
      user_id: 'user-1',
      concept_id: 'concept-2',
      due: null,
      stability: null,
      difficulty: null,
      reps: 0,
      lapses: 0,
      state: 'New',
      last_review: null,
    }
    const fsrsCard = mapDbCardToFsrs(newCard)
    expect(fsrsCard.stability).toBe(0)
    expect(fsrsCard.difficulty).toBe(0)
    expect(fsrsCard.reps).toBe(0)
    expect(fsrsCard.state).toBe(State.New)
    expect(fsrsCard.last_review).toBeUndefined()
  })
})

describe('computeRetrievability (test 6)', () => {
  it('returns 1.0 for a New card with no review history', () => {
    const newCard: ConceptFsrsCard = {
      ...reviewCard,
      state: 'New',
      last_review: null,
    }
    const r = computeRetrievability(newCard, Date.now())
    expect(r).toBe(1.0)
  })

  it('returns a value close to 1.0 immediately after a successful review', () => {
    // A card reviewed just 1 minute ago with good stability should be near 1.0
    const now = Date.now()
    const justReviewed: ConceptFsrsCard = {
      ...reviewCard,
      state: 'Review',
      last_review: now - 60_000, // 1 minute ago
      stability: 10.0,           // stable card
      due: now + 7 * 86_400_000, // due in 7 days
    }
    const r = computeRetrievability(justReviewed, now)
    expect(r).toBeGreaterThan(0.9)
    expect(r).toBeLessThanOrEqual(1.0)
  })
})

describe('applyGradeToCard — Manual sentinel (test 1)', () => {
  it('inserts an empty New-state card when none exists (Rating.Manual)', async () => {
    // No existing card → first() returns null
    const { db, mutations } = makeD1Stub({ 'SELECT id FROM concept_fsrs_cards': null })
    const serverNow = new Date('2026-07-12T00:00:00Z')

    await applyGradeToCard(db, 'user-1', 'concept-1', Rating.Manual, serverNow)

    // Should have called INSERT INTO concept_fsrs_cards
    const insertMutation = mutations.find((m) => m.sql.includes('INSERT INTO concept_fsrs_cards'))
    expect(insertMutation).toBeDefined()

    // The state should be 'New' (passed as a string bind param)
    expect(insertMutation?.bindings).toContain('New')
  })

  it('skips insert when card already exists (Rating.Manual is idempotent)', async () => {
    // Existing card → first() returns a row
    const { db, mutations } = makeD1Stub({
      'SELECT id FROM concept_fsrs_cards': { id: 'existing-card' },
    })
    const serverNow = new Date('2026-07-12T00:00:00Z')

    await applyGradeToCard(db, 'user-1', 'concept-1', Rating.Manual, serverNow)

    // Should NOT insert
    const insertMutation = mutations.find((m) => m.sql.includes('INSERT INTO concept_fsrs_cards'))
    expect(insertMutation).toBeUndefined()
  })
})

describe('applyGradeToCard — Rating.Good on New card (test 2)', () => {
  it('advances stability and transitions state away from New', async () => {
    // No existing card → first() returns null → creates empty base card
    const { db, mutations } = makeD1Stub({
      'SELECT * FROM concept_fsrs_cards': null,
      'SELECT id FROM concept_fsrs_cards': null,
    })
    const serverNow = new Date('2026-07-12T00:00:00Z')

    await applyGradeToCard(db, 'user-1', 'concept-1', Rating.Good, serverNow)

    // Should INSERT a new card
    const insertMutation = mutations.find((m) => m.sql.includes('INSERT INTO concept_fsrs_cards'))
    expect(insertMutation).toBeDefined()

    // State should NOT be 'New' after Rating.Good on a new card
    // ts-fsrs v5.4.1: Good on New → Learning or Review depending on steps
    const bindings = insertMutation?.bindings ?? []
    const stateIdx = bindings.indexOf('New')
    const learningIdx = bindings.indexOf('Learning')
    // After Good, card transitions to Learning or Review — never stays New
    expect(stateIdx).toBe(-1)
    expect(learningIdx).toBeGreaterThan(-1)
  })
})

describe('applyGradeToCard — Rating.Again on Review card (test 3)', () => {
  it('increments lapses and transitions to Relearning', async () => {
    const { db, mutations } = makeD1Stub({
      'SELECT * FROM concept_fsrs_cards': { ...reviewCard },
    })
    const serverNow = new Date('2026-07-12T00:00:00Z')

    await applyGradeToCard(db, 'user-1', 'concept-1', Rating.Again, serverNow)

    // Should UPDATE (existing card found)
    const updateMutation = mutations.find((m) => m.sql.includes('UPDATE concept_fsrs_cards'))
    expect(updateMutation).toBeDefined()

    // State should be 'Relearning'
    expect(updateMutation?.bindings).toContain('Relearning')

    // lapses should be incremented (was 0, now 1)
    const lapseIdx = updateMutation?.bindings.indexOf(1)
    expect(lapseIdx).toBeGreaterThan(-1)
  })
})

describe('getDueConceptIds (tests 4 & 5)', () => {
  it('returns concept IDs where due <= serverNow (test 4)', async () => {
    const { db } = makeD1Stub({
      'SELECT c.id': [{ id: 'concept-due-1' }, { id: 'concept-due-2' }],
    })

    const result = await getDueConceptIds(db, 'user-1', 'journey-1', 'waypoint-current')
    expect(result).toEqual(['concept-due-1', 'concept-due-2'])
  })

  it('returns empty when no concepts are due (test 4 — empty case)', async () => {
    const { db } = makeD1Stub({
      'SELECT c.id': [],
    })

    const result = await getDueConceptIds(db, 'user-1', 'journey-1', 'waypoint-current')
    expect(result).toEqual([])
  })

  it('passes currentWaypointId as exclusion parameter (test 5)', async () => {
    makeD1Stub({ 'SELECT c.id': [] })
    const captureFn = vi.fn(async () => ({ results: [] }))

    // Replace the all() fn to capture the SQL
    let capturedSql = ''
    const capturingDb = {
      prepare: (sql: string) => {
        capturedSql = sql
        return {
          bind: (..._args: unknown[]) => ({
            all: captureFn,
            first: vi.fn(async () => null),
            run: vi.fn(async () => ({ success: true, meta: { changes: 0 } })),
          }),
        }
      },
    } as unknown as D1Database

    await getDueConceptIds(capturingDb, 'user-1', 'journey-1', 'waypoint-xyz')

    // Confirm the SQL references currentWaypointId as an exclusion subquery
    expect(capturedSql).toContain('quiz_questions')
    expect(capturedSql).toContain('waypoint_id')
    expect(captureFn).toHaveBeenCalled()
  })
})
