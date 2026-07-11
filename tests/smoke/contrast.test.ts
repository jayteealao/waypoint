/**
 * WCAG 2.1 AA contrast audit for the OKLCH ember design tokens.
 *
 * All conversion arithmetic is inline — no library dependency.
 * Formula sources:
 *   - OKLCH → OKLab: https://bottosson.github.io/posts/oklab/
 *   - OKLab → linear-sRGB: OKLab M1/M2 inverse matrices
 *   - WCAG 2.1 relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   - Contrast ratio: (L1 + 0.05) / (L2 + 0.05)
 *
 * AA thresholds: normal text ≥ 4.5:1, large text ≥ 3:1.
 */

import { describe, it, expect } from 'vitest'

/* ─── Colour math ────────────────────────────────────────────────────── */

/** Convert degrees to radians */
const toRad = (deg: number) => (deg * Math.PI) / 180

/** OKLCH → linear-sRGB via OKLab. Returns [r, g, b] in [0, 1]. */
function oklchToLinearSRGB(L: number, C: number, H: number): [number, number, number] {
  // Step 1: OKLCH → OKLab
  const a = C * Math.cos(toRad(H))
  const b = C * Math.sin(toRad(H))

  // Step 2: OKLab → LMS^(1/3) via M2 inverse
  // M2 inverse from OKLab spec
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b

  // Step 3: LMS^(1/3) → LMS (cube)
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  // Step 4: LMS → linear sRGB via M1 inverse
  const r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  return [r, g, blue]
}

/** WCAG 2.1 relative luminance from linear-sRGB channel values.
 *  Channels must already be linearised (no gamma). */
function wcagLuminance(rLin: number, gLin: number, bLin: number): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  return 0.2126 * clamp(rLin) + 0.7152 * clamp(gLin) + 0.0722 * clamp(bLin)
}

/** WCAG contrast ratio between two luminance values. */
function contrastRatio(L1: number, L2: number): number {
  const lighter = Math.max(L1, L2)
  const darker  = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Convenience: compute contrast between two OKLCH colours. */
function oklchContrast(
  [L1, C1, H1]: [number, number, number],
  [L2, C2, H2]: [number, number, number],
): number {
  const lum1 = wcagLuminance(...oklchToLinearSRGB(L1, C1, H1))
  const lum2 = wcagLuminance(...oklchToLinearSRGB(L2, C2, H2))
  return contrastRatio(lum1, lum2)
}

/* ─── Token constants (from src/styles.css) ─────────────────────────── */

const TOKENS = {
  light: {
    ember:        [0.54, 0.19,  32] as [number, number, number],
    emberSubtle:  [0.96, 0.04,  50] as [number, number, number],
    paper:        [0.98, 0.018, 80] as [number, number, number],
    paperMid:     [0.94, 0.022, 78] as [number, number, number],
    surface:      [0.99, 0.008, 80] as [number, number, number],
    ink:          [0.24, 0.032, 30] as [number, number, number],
    inkMuted:     [0.44, 0.038, 30] as [number, number, number],
    inkFaint:     [0.64, 0.028, 30] as [number, number, number],
    white:        [1.00, 0.00,   0] as [number, number, number],
    success:      [0.52, 0.14, 145] as [number, number, number],
  },
  dark: {
    ember:        [0.72, 0.14,  38] as [number, number, number],
    paper:        [0.14, 0.018, 255] as [number, number, number],
    paperMid:     [0.18, 0.016, 255] as [number, number, number],
    surface:      [0.20, 0.014, 255] as [number, number, number],
    ink:          [0.88, 0.015,  80] as [number, number, number],
    inkMuted:     [0.68, 0.018,  80] as [number, number, number],
    inkFaint:     [0.50, 0.016,  80] as [number, number, number],
    white:        [1.00, 0.00,    0] as [number, number, number],
  },
}

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('OKLCH ember token pairs — WCAG 2.1 AA contrast audit', () => {
  const AA_NORMAL = 4.5
  const AA_LARGE  = 3.0

  // ── Light theme ────────────────────────────────────────────────────── //

  describe('light theme', () => {
    it('white text on --ember (primary action) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.light.white, TOKENS.light.ember)
      expect(ratio, `white / ember = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink text on --paper (body text on page base) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.light.ink, TOKENS.light.paper)
      expect(ratio, `ink / paper = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink text on --surface (card text) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.light.ink, TOKENS.light.surface)
      expect(ratio, `ink / surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink-muted text on --surface (secondary card text) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.light.inkMuted, TOKENS.light.surface)
      expect(ratio, `ink-muted / surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink text on --paper-mid (sidebar text) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.light.ink, TOKENS.light.paperMid)
      expect(ratio, `ink / paper-mid = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink-muted text on --paper (secondary body text) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.light.inkMuted, TOKENS.light.paper)
      expect(ratio, `ink-muted / paper = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ember-subtle background contrast: --ember text on --ember-subtle ≥ 3:1 (large text chip)', () => {
      const ratio = oklchContrast(TOKENS.light.ember, TOKENS.light.emberSubtle)
      expect(ratio, `ember / ember-subtle = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_LARGE)
    })

    it('white text on --success (mastery green badge) ≥ 3:1', () => {
      const ratio = oklchContrast(TOKENS.light.white, TOKENS.light.success)
      expect(ratio, `white / success = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_LARGE)
    })
  })

  // ── Dark theme ──────────────────────────────────────────────────────── //

  describe('dark theme', () => {
    it('--ink text on --paper (body on base) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.dark.ink, TOKENS.dark.paper)
      expect(ratio, `dark ink / dark paper = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink text on --surface (card text) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.dark.ink, TOKENS.dark.surface)
      expect(ratio, `dark ink / dark surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink-muted text on --surface (secondary text on card) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.dark.inkMuted, TOKENS.dark.surface)
      expect(ratio, `dark ink-muted / dark surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('--ink text on --paper-mid (sidebar text on dark) ≥ 4.5:1', () => {
      const ratio = oklchContrast(TOKENS.dark.ink, TOKENS.dark.paperMid)
      expect(ratio, `dark ink / dark paper-mid = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL)
    })

    it('dark --ember text on dark --paper ≥ 3:1 (ember headings on dark page)', () => {
      const ratio = oklchContrast(TOKENS.dark.ember, TOKENS.dark.paper)
      expect(ratio, `dark ember / dark paper = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_LARGE)
    })
  })
})
