import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
// @ts-expect-error — .mjs script has no type declarations; it is plain ESM JS.
// sdlc-debt: untyped local script import; upgrade path is a .d.ts alongside secret-scan.mjs if it grows a public API.
import { secretScan } from "../../scripts/secret-scan.mjs";

const wrapperPath = resolve(fileURLToPath(import.meta.url), "../../../scripts/secret-scan.mjs");

describe("secret-scan wrapper resilience", () => {
  // AC-GLR1 — absent gitleaks binary → commit-time step succeeds with a visible skip warning.
  // gitleaks is genuinely absent in this environment, so spawning the real wrapper exercises
  // the true degrade path end-to-end (not a mock).
  it("AC-GLR1: real spawn exits 0 with a skip warning when gitleaks is absent", () => {
    const r = spawnSync("node", [wrapperPath], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/not installed|skipping/i);
  });

  // AC-GLR2 — a present gitleaks that reports a finding still fails the commit. Injecting a
  // fake spawn that returns a non-zero status proves the wrapper propagates a running scanner's
  // exit code verbatim (resilience did not neuter the scan).
  it("AC-GLR2: propagates a running gitleaks non-zero status (finding still blocks)", () => {
    const fakeSpawn = vi.fn(() => ({ status: 1 }));
    const log = vi.fn();
    expect(secretScan(fakeSpawn, log)).toBe(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("AC-GLR2: degrades to 0 with a warning only on launch failure (ENOENT)", () => {
    const fakeSpawn = vi.fn(() => ({
      error: Object.assign(new Error("spawn gitleaks ENOENT"), { code: "ENOENT" }),
    }));
    const log = vi.fn();
    expect(secretScan(fakeSpawn, log)).toBe(0);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toMatch(/not installed|skipping/i);
  });

  it("treats a null status (signal-killed scanner) as a failure, not a silent pass", () => {
    const fakeSpawn = vi.fn(() => ({ status: null }));
    expect(secretScan(fakeSpawn, vi.fn())).toBe(1);
  });
});
