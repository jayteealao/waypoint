// Pre-commit secret scan wrapper. Runs `gitleaks protect --staged` when the
// gitleaks system binary is present; degrades gracefully (visible warning,
// non-blocking exit 0) when it is absent, so a missing optional scanner never
// walls an otherwise-clean commit. CI runs its own gitleaks gate and stays
// authoritative. Install locally: `winget install gitleaks` / `scoop install gitleaks`.
//   node scripts/secret-scan.mjs
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SKIP_MESSAGE =
  "secret-scan: gitleaks not installed — skipping local secret scan " +
  "(install: winget install gitleaks / scoop install gitleaks). CI still enforces the scan.";

// Returns the exit code the hook should use. Degrades ONLY on launch failure
// (result.error, e.g. ENOENT when the binary is absent); a gitleaks process
// that actually ran propagates its own status verbatim, so a real finding
// still fails the commit.
export function secretScan(spawn = spawnSync, log = console.error) {
  const result = spawn("gitleaks", ["protect", "--staged", "--no-banner"], { stdio: "inherit" });
  if (result.error) {
    log(SKIP_MESSAGE);
    return 0;
  }
  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(secretScan());
}
