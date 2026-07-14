/**
 * Canonical fixture data for the lesson renderer.
 *
 * FIXTURE_LESSON exercises every schema node type — heading, prose (with inline
 * markup), code, citation, checkpoint-question widget, flipcard widget — and
 * carries the recommended-primary-source block.
 *
 * HOSTILE_INPUTS is the shared source of truth for both the adversarial Vitest
 * unit tests (sanitize.ts, widget-registry.ts) and any future Playwright
 * security smoke tests.
 */

import type { LessonDocumentV1 } from "#/types/lesson-document";

export const FIXTURE_LESSON: LessonDocumentV1 = {
  version: 1,
  title: "Understanding Async/Await in TypeScript",
  summary:
    "A guided lesson covering the mental model behind asynchronous JavaScript, how async/await maps to Promises, and when to reach for each pattern.",
  sections: [
    {
      type: "heading",
      id: "h-intro",
      level: 2,
      text: "Why Async Matters",
    },
    {
      type: "prose",
      id: "p-intro",
      html: "JavaScript is <strong>single-threaded</strong> — only one piece of code runs at a time. Yet the web is full of things that take time: network requests, file reads, timers. <em>Async</em> is the language's answer: hand slow work to the runtime, keep the thread free, and get a callback when it's done.",
    },
    {
      type: "heading",
      id: "h-promises",
      level: 3,
      text: "Promises Under the Hood",
    },
    {
      type: "prose",
      id: "p-promises",
      html: "A <code>Promise</code> represents a value that may not exist yet. It can be in one of three states: <strong>pending</strong>, <strong>fulfilled</strong>, or <strong>rejected</strong>. Once settled, its state never changes — a promise resolves exactly once.",
    },
    {
      type: "code",
      id: "c-promise-example",
      language: "typescript",
      code: `async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`)
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`)
  }
  return response.json() as Promise<User>
}

// Error handling with try/catch
try {
  const user = await fetchUser('abc-123')
  console.log(user.name)
} catch (err) {
  console.error('Fetch failed:', err)
}`,
    },
    {
      type: "citation",
      id: "cit-mdn",
      quote:
        "The async function declaration creates a binding of a new async function to a given name. The await keyword is permitted within the function body, enabling asynchronous, promise-based behavior to be written in a cleaner style.",
      source: "MDN Web Docs — async function",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function",
    },
    {
      type: "widget",
      id: "wgt-checkpoint-1",
      widget_type: "checkpoint-question",
      props: {
        question: "What are the three possible states of a JavaScript Promise?",
        options: [
          "pending, fulfilled, rejected",
          "loading, success, failure",
          "open, resolved, closed",
          "waiting, done, error",
        ],
        correct_index: 0,
        explanation:
          "A Promise is always in one of three states: pending (not yet settled), fulfilled (resolved with a value), or rejected (failed with a reason). Once settled it never transitions again.",
      },
    },
    {
      type: "widget",
      id: "wgt-flipcard-1",
      widget_type: "flipcard",
      props: {
        front: "What does the await keyword do?",
        back: "It pauses execution of the async function until the Promise settles, then returns the resolved value (or throws on rejection). The event loop is free to run other tasks while waiting.",
      },
    },
  ],
  sources: [
    {
      title: "MDN — async function",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function",
      author: "MDN contributors",
    },
    {
      title: "TC39 — ECMAScript Async Functions Proposal",
      url: "https://github.com/tc39/proposal-async-await",
      author: null,
    },
  ],
  recommended_primary_source: {
    title: "MDN Web Docs — Using Promises",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises",
    author: "MDN contributors",
  },
};

/**
 * XSS and injection attempts used in adversarial unit tests.
 * The last entry is a VALID inline tag that must survive sanitization.
 */
export const HOSTILE_INPUTS: string[] = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  '<iframe src="javascript:void(0)"></iframe>',
  '<a href="javascript:alert(1)">click me</a>',
  '<div onmouseover="evil()">hover</div>',
  "javascript:alert(1)",
  // valid markup — must be preserved
  "<em>emphasized text</em>",
];
