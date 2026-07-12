/**
 * Source URL fetch — source-grounding slice.
 *
 * Workers-native URL fetch with 30-second timeout, 512 KB size limit,
 * content-type validation (text/html and text/plain only), HTML tag stripping,
 * and 5 000-char truncation. Targets static-HTML pages; JS-rendered SPAs
 * extract poorly (sdlc-debt: upgrade to HTMLRewriter or a DOM parser if
 * content-extraction quality becomes a product issue in v2).
 *
 * All failure modes return a typed error union; no exceptions escape.
 * The caller (interview.ts sendTurn) decides how to surface the failure.
 *
 * Build-avoidance: rung 2 native platform (fetch + AbortController);
 * rung 4 new code for regex extraction (HTMLRewriter is async-heavy for
 * this use case — see plan Simplicity Ladder).
 */

/** Structured content extracted from a fetched source page. */
export interface SourceContent {
  url: string
  title: string
  extractedText: string
}

/** Discriminated union result — ok: true on success, ok: false on any failure. */
export type SourceFetchResult =
  | ({ ok: true } & SourceContent)
  | { ok: false; reason: 'network_error' | 'timeout' | 'bad_content_type' | 'too_large' }

/** Maximum body size to stream before aborting (512 KB). */
const MAX_BYTES = 524_288

/** Maximum extracted text to retain after HTML stripping (5 000 chars). */
const MAX_TEXT_CHARS = 5_000

/** Fetch timeout in milliseconds (30 seconds). */
const FETCH_TIMEOUT_MS = 30_000

/**
 * Fetch a URL and extract its text content for grounding prompts.
 *
 * Validates URL format, enforces timeout, size, and content-type limits,
 * then extracts <title> and visible body text from HTML using regex tag
 * stripping. Static-HTML target; JS-rendered SPAs extract at best-effort.
 *
 * Returns SourceFetchResult discriminated by ok: boolean.
 */
export async function fetchSourceUrl(url: string): Promise<SourceFetchResult> {
  // Validate URL format — invalid URLs cannot be fetched
  try {
    new URL(url)
  } catch {
    return { ok: false, reason: 'network_error' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' }
    }
    return { ok: false, reason: 'network_error' }
  } finally {
    clearTimeout(timeoutId)
  }

  // Content-type check: accept only text/html and text/plain
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    return { ok: false, reason: 'bad_content_type' }
  }

  // Content-Length pre-check to avoid streaming an oversized body
  const contentLengthHeader = response.headers.get('content-length')
  if (contentLengthHeader !== null && parseInt(contentLengthHeader, 10) > MAX_BYTES) {
    return { ok: false, reason: 'too_large' }
  }

  // Stream body with byte accumulator; abort if size limit exceeded mid-stream
  const reader = response.body?.getReader()
  if (!reader) {
    return { ok: false, reason: 'network_error' }
  }

  let rawHtml = ''
  let bytesRead = 0
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      bytesRead += value.byteLength
      if (bytesRead > MAX_BYTES) {
        reader.cancel()
        return { ok: false, reason: 'too_large' }
      }
      rawHtml += decoder.decode(value, { stream: true })
    }
  }
  // Flush any remaining bytes in the decoder
  rawHtml += decoder.decode()

  // Extract <title> via regex
  const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch?.[1]?.trim() ?? ''

  // Strip HTML tags, collapse whitespace, truncate to MAX_TEXT_CHARS
  const stripped = rawHtml.replace(/<[^>]+>/g, ' ')
  const collapsed = stripped.replace(/\s+/g, ' ').trim()
  const extractedText = collapsed.slice(0, MAX_TEXT_CHARS)

  return { ok: true, url, title, extractedText }
}
