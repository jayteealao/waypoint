/**
 * Parse the structured log lines a `console.log` spy captured.
 *
 * The gateway emits its `generation.*` signals as single-line JSON via `console.log`.
 * Three smoke-test files spy on it and need the same thing back: every call whose
 * first argument parses as JSON, as an object — anything else logged (a stray string,
 * an error dump) is silently skipped rather than failing the parse.
 */
export function signals(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  const parsed: Array<Record<string, unknown>> = [];
  for (const call of spy.mock.calls) {
    try {
      parsed.push(JSON.parse(call[0] as string) as Record<string, unknown>);
    } catch {
      // Not a structured signal line — ignore.
    }
  }
  return parsed;
}
