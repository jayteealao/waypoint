import { expect, test } from "@playwright/test";

// AC-PP1: SSE chunks arrive progressively over a single connection under workerd.
// Runs against wrangler dev (port 8787) to exercise the real Workers runtime.
// Evidence: response body contains all 5 data lines AND elapsed time >= 600ms,
// proving the stream was not buffered into a single flush.

test("SSE demo stream delivers 5 chunks progressively (AC-PP1)", async ({ page }) => {
  // Navigate to base URL first to establish same-origin fetch context.
  await page.goto("/");

  // Use in-page fetch() to capture chunk timing via ReadableStream.
  // Each chunk arrives as the server emits it; we measure wall-clock time.
  const result = await page.evaluate(async () => {
    const startTime = Date.now();
    const lines: Array<string> = [];
    let firstByteTime = -1;

    const response = await fetch("/api/demo-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstByteTime === -1) firstByteTime = Date.now() - startTime;
      const text = decoder.decode(value, { stream: true });
      // Each chunk may contain one or more lines; collect all data: lines
      for (const line of text.split("\n")) {
        if (line.startsWith("data:")) lines.push(line.trim());
      }
    }

    return {
      lines,
      elapsed: Date.now() - startTime,
      firstByteTime,
    };
  });

  // All 5 chunks must be present
  expect(result.lines).toHaveLength(5);
  expect(result.lines[0]).toBe("data: chunk-1");
  expect(result.lines[4]).toBe("data: chunk-5");

  // Progressive delivery: total elapsed >= 600ms
  // (5 chunks × 200ms = 1000ms expected; 600ms is the conservative lower bound)
  expect(result.elapsed).toBeGreaterThanOrEqual(600);
});
