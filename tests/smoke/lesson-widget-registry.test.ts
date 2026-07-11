/**
 * Adversarial unit tests — widget registry and HTML sanitizer.
 *
 * Security contract: unknown/malformed widget types are rejected before any
 * component is rendered; hostile HTML strings are stripped before they reach
 * dangerouslySetInnerHTML. These tests are the proof of the trust model.
 *
 * @vitest-environment jsdom
 *
 * The jsdom environment gives DOMPurify a `document` object so the sanitizer
 * can run its full pipeline (not just the escapeHtml SSR fallback).
 * `sanitizerReady` is awaited in `beforeAll` to ensure DOMPurify is loaded
 * before the sanitize assertions run.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resolveWidget } from '#/lib/lesson/widget-registry'
import { sanitizeHtml, sanitizerReady } from '#/lib/lesson/sanitize'
import { CheckpointQuestion } from '#/components/lesson/widgets/CheckpointQuestion'
import { Flipcard } from '#/components/lesson/widgets/Flipcard'

// ─── Wait for DOMPurify to load ───────────────────────────────────────────────

beforeAll(async () => {
  await sanitizerReady
})

// ─── Widget registry — rejection paths ───────────────────────────────────────

describe('widget-registry — unknown types', () => {
  it('rejects an unknown widget type', () => {
    const result = resolveWidget('unknown-type', {})
    expect(result).toBeNull()
  })

  it('rejects a partial widget type string', () => {
    expect(resolveWidget('checkpoint', {})).toBeNull()
    expect(resolveWidget('flip-card', {})).toBeNull()
    expect(resolveWidget('', {})).toBeNull()
  })
})

describe('widget-registry — invalid props', () => {
  it('rejects checkpoint-question with missing fields', () => {
    expect(resolveWidget('checkpoint-question', { notAQuestion: true })).toBeNull()
  })

  it('rejects checkpoint-question with wrong option type', () => {
    expect(
      resolveWidget('checkpoint-question', {
        question: 'Q?',
        options: [1, 2, 3],   // numbers, not strings
        correct_index: 0,
        explanation: 'E',
      }),
    ).toBeNull()
  })

  it('rejects checkpoint-question with null props', () => {
    expect(resolveWidget('checkpoint-question', null)).toBeNull()
  })

  it('rejects flipcard with missing back field', () => {
    expect(resolveWidget('flipcard', { front: 'Question only' })).toBeNull()
  })

  it('rejects flipcard with wrong types', () => {
    expect(resolveWidget('flipcard', { front: 42, back: true })).toBeNull()
  })
})

// ─── Widget registry — acceptance paths ──────────────────────────────────────

describe('widget-registry — valid resolution', () => {
  it('resolves checkpoint-question with valid props', () => {
    const result = resolveWidget('checkpoint-question', {
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correct_index: 1,
      explanation: 'Basic arithmetic.',
    })
    expect(result).not.toBeNull()
    expect(result!.component).toBe(CheckpointQuestion)
    expect(result!.validProps).toMatchObject({
      question: 'What is 2 + 2?',
      correct_index: 1,
    })
  })

  it('resolves flipcard with valid props', () => {
    const result = resolveWidget('flipcard', { front: 'Question', back: 'Answer' })
    expect(result).not.toBeNull()
    expect(result!.component).toBe(Flipcard)
    expect(result!.validProps).toMatchObject({ front: 'Question', back: 'Answer' })
  })
})

// ─── Sanitizer — hostile input rejection ─────────────────────────────────────

describe('sanitizeHtml — script/injection rejection', () => {
  it('strips <script> tags', () => {
    const output = sanitizeHtml('<script>alert(1)</script>Hello')
    expect(output).not.toContain('<script>')
    expect(output).toContain('Hello')
  })

  it('strips <img> with onerror (img not in allowed tags)', () => {
    const output = sanitizeHtml('<img src=x onerror=alert(1)>')
    expect(output).not.toContain('<img')
    expect(output).not.toContain('onerror')
  })

  it('strips <iframe>', () => {
    const output = sanitizeHtml('<iframe src="javascript:void(0)"></iframe>')
    expect(output).not.toContain('<iframe')
  })

  it('strips javascript: href from <a>', () => {
    const output = sanitizeHtml('<a href="javascript:alert(1)">click me</a>')
    // DOMPurify removes javascript: hrefs; either no href or link text only
    expect(output).not.toContain('javascript:')
  })

  it('strips event handler attributes from block elements', () => {
    const output = sanitizeHtml('<div onmouseover="evil()">hover</div>')
    expect(output).not.toContain('onmouseover')
    expect(output).not.toContain('evil()')
  })
})

// ─── Sanitizer — valid markup preservation ───────────────────────────────────

describe('sanitizeHtml — allowed markup preserved', () => {
  it('preserves <em> inline formatting', () => {
    const output = sanitizeHtml('<em>emphasized text</em>')
    expect(output).toContain('<em>emphasized text</em>')
  })

  it('preserves <strong> inline formatting', () => {
    const output = sanitizeHtml('<strong>bold</strong>')
    expect(output).toContain('<strong>bold</strong>')
  })

  it('preserves <code> inline', () => {
    const output = sanitizeHtml('Use <code>async/await</code>')
    expect(output).toContain('<code>async/await</code>')
  })

  it('preserves mixed inline markup', () => {
    const output = sanitizeHtml('<strong>Bold</strong> and <em>italic</em>')
    expect(output).toContain('<strong>Bold</strong>')
    expect(output).toContain('<em>italic</em>')
  })

  it('preserves plain text without modification', () => {
    const output = sanitizeHtml('No HTML here, just text.')
    expect(output).toBe('No HTML here, just text.')
  })
})
