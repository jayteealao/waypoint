// Copies TanStack Intent skills from node_modules into .claude/skills/ so
// Claude Code triggers them natively. Re-run after bumping @tanstack/* deps.
//   pnpm node scripts/sync-tanstack-skills.mjs
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkgsDir = join(root, "node_modules", "@tanstack");
const outDir = join(root, ".claude", "skills");

// discover: node_modules/@tanstack/<pkg>/skills/**/SKILL.md
const skills = []; // { pkg, srcDir, segments }
for (const pkg of readdirSync(pkgsDir)) {
  const skillsRoot = join(pkgsDir, pkg, "skills");
  let entries;
  try {
    entries = statSync(skillsRoot).isDirectory();
  } catch {
    continue;
  }
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "SKILL.md") {
        skills.push({ pkg, srcDir: dir, segments: relative(skillsRoot, dir).split(sep) });
      }
    }
  };
  walk(skillsRoot);
}

// flat name: join path segments; "lifecycle/..." gets the package name as prefix instead
const flatName = ({ pkg, segments }) => {
  const segs = segments[0] === "lifecycle" ? [pkg, ...segments.slice(1)] : segments;
  return segs.join("-");
};

// map absolute source SKILL.md dir -> flat name, for link rewriting
const dirToFlat = new Map(skills.map((s) => [resolve(s.srcDir), flatName(s)]));

rmSync(outDir, { recursive: true, force: true });
let count = 0;
for (const skill of skills) {
  const flat = flatName(skill);
  const dest = join(outDir, flat);
  mkdirSync(dest, { recursive: true });

  for (const name of readdirSync(skill.srcDir)) {
    const src = join(skill.srcDir, name);
    if (statSync(src).isDirectory()) {
      // sub-skill dirs become their own top-level skills; copy only asset dirs
      const hasOwnSkill = dirToFlat.has(resolve(src));
      if (!hasOwnSkill && name !== "_artifacts") cpSync(src, join(dest, name), { recursive: true });
      continue;
    }
    if (name !== "SKILL.md") {
      cpSync(src, join(dest, name));
      continue;
    }

    let text = readFileSync(src, "utf8");
    // frontmatter name must match the (flattened) directory name
    text = text.replace(/^(---\r?\n(?:.*\r?\n)*?)name:[^\r\n]*/m, `$1name: ${flat}`);
    // rewrite relative links between skills to the flattened sibling layout
    text = text.replace(/\(((?:\.\.?\/)[^)]*?)SKILL\.md\)/g, (match, rel) => {
      const target = dirToFlat.get(resolve(skill.srcDir, rel));
      return target ? `(../${target}/SKILL.md)` : match;
    });
    writeFileSync(join(dest, "SKILL.md"), text);
    count++;
  }
}
console.log(`Synced ${count} skills into ${relative(root, outDir)}`);
