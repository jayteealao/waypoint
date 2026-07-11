// @vitest-environment node
// Schema assertions run in Node; reads the SQL file from disk.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'

describe('D1 migration v1 schema assertions (AC-ADL3)', () => {
  let sql: string

  beforeAll(() => {
    sql = readFileSync(join(process.cwd(), 'migrations/0000_schema_v1.sql'), 'utf-8')
  })

  it('uses CREATE TABLE IF NOT EXISTS throughout — no bare CREATE TABLE', () => {
    // Regex: CREATE TABLE followed by something other than IF
    // Allow word boundaries and whitespace variations
    const bareCreate = sql.match(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi)
    expect(bareCreate).toBeNull()
  })

  it('includes all expected domain tables', () => {
    const expectedTables = [
      'journeys',
      'waypoints',
      'lessons',
      'quiz_questions',
      'quiz_attempts',
      'concepts',
      'concept_fsrs_cards',
      'usage_events',
    ]
    for (const table of expectedTables) {
      expect(sql, `Expected table "${table}" in schema`).toContain(table)
    }
  })

  it('includes all seven FSRS card columns per ts-fsrs v5.4.1', () => {
    const fsrsColumns = [
      'due',
      'stability',
      'difficulty',
      'reps',
      'lapses',
      'state',
      'last_review',
    ]
    for (const col of fsrsColumns) {
      expect(sql, `Expected FSRS column "${col}" in schema`).toContain(col)
    }
  })

  it('includes quiz_questions.type column extensible to future task type', () => {
    // Must have a type column in quiz_questions and reference 'mc' (default) and 'task'
    expect(sql).toContain("'mc'")
    expect(sql).toContain("'task'")
    // The quiz_questions section must mention 'type'
    const quizSection = sql.slice(
      sql.indexOf('quiz_questions'),
      sql.indexOf('quiz_attempts'),
    )
    expect(quizSection).toContain('type')
  })

  it('includes better-auth core tables', () => {
    for (const table of ['user', 'session', 'account', 'verification']) {
      expect(sql, `Expected better-auth table "${table}"`).toContain(table)
    }
  })
})
