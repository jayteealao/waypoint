/**
 * DOMPurify wrapper with Cloudflare Worker SSR guard.
 *
 * DOMPurify requires a browser DOM context. This module:
 *   1. Detects the SSR/Worker context (no `document`) and falls back to
 *      `escapeHtml` (plain tag-strip) — prose renders as plain text until
 *      hydration re-sanitizes.
 *   2. Dynamically imports DOMPurify so it is never bundled into the Worker
 *      SSR path. The browser-side import is kicked off eagerly on module load.
 *   3. Exposes `sanitizerReady` — a Promise tests (and eager-init callers) can
 *      await before calling `sanitizeHtml` to ensure DOMPurify is loaded.
 *
 * Security contract:
 *   - ALLOWED_TAGS: inline formatting only; no block elements, no media
 *   - ALLOWED_ATTR: href and class only; no on*, no style, no data-*
 *   - FORCE_BODY: true — wraps content so DOMPurify can inspect context
 *   - No SAFE_FOR_XML, no IN_PLACE, no ADD_TAGS, no ADD_ATTR
 */

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "code", "a", "span", "br", "u"],
  // 'class' intentionally omitted: AI-generated inline HTML does not need author-controlled
  // CSS class names; allowing it would permit arbitrary class injection from model output.
  ALLOWED_ATTR: ["href"],
  FORCE_BODY: true,
} as const;

/**
 * Strip all HTML tags — used as SSR-safe fallback when DOMPurify is not
 * available. Prose displays as plain text; hydration upgrades to DOMPurify.
 * Does NOT preserve any markup — it is NOT a sanitizer, only an SSR guard.
 *
 * Exported so ProseSection can use it as a stable initial value that always
 * matches what the SSR render produces (avoiding React 19 hydration mismatches).
 */
export function escapeHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

// ─── Lazy DOMPurify singleton ─────────────────────────────────────────────────

type PurifyLike = { sanitize(html: string, cfg: object): string };
let _purify: PurifyLike | null = null;

/**
 * Resolves when DOMPurify has been loaded into `_purify`.
 * In SSR/Worker contexts (no `document`) this resolves immediately to a no-op.
 * In browser/jsdom contexts the dynamic import is kicked off immediately.
 */
export const sanitizerReady: Promise<void> =
  typeof document !== "undefined"
    ? import("dompurify").then((m) => {
        _purify = (m.default ?? m) as PurifyLike;
      })
    : Promise.resolve();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sanitize an HTML string for use in `dangerouslySetInnerHTML`.
 *
 * - If `document` is not available (Worker SSR): returns `escapeHtml(html)`.
 * - If DOMPurify is not yet loaded (first render before import resolves):
 *   returns `escapeHtml(html)` as a safe fallback.
 * - Otherwise: returns DOMPurify-sanitized HTML with the inline-only config.
 *
 * Tests should `await sanitizerReady` in `beforeAll` to ensure DOMPurify is
 * loaded before calling this function.
 */
export function sanitizeHtml(html: string): string {
  if (typeof document === "undefined" || _purify === null) {
    return escapeHtml(html);
  }
  return _purify.sanitize(html, SANITIZE_CONFIG);
}
