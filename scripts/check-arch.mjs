#!/usr/bin/env node
// check:arch — CLAUDE.md → Verificatie: "shells geïsoleerd, features
// shell-onwetend, Supabase-client privé". See scripts/lib/scan.mjs for
// what this is and isn't (regex over source, not a real AST — first pass).
import { walk, read, importsOf, fail } from "./lib/scan.mjs";

const root = process.cwd();
const files = walk(`${root}/src`, root);
const problems = [];

for (const file of files) {
  const source = read(root, file);
  const specs = importsOf(source);

  for (const spec of specs) {
    // 1. Shells isolated: shells/bar must not import from shells/portal,
    //    and vice versa.
    if (file.startsWith("src/shells/bar/") && /shells\/portal/.test(spec)) {
      problems.push(`${file}: imports "${spec}" — shells/bar must not import from shells/portal`);
    }
    if (file.startsWith("src/shells/portal/") && /shells\/bar/.test(spec)) {
      problems.push(`${file}: imports "${spec}" — shells/portal must not import from shells/bar`);
    }

    // 2. Features are shell-agnostic: they read useShell(), they don't
    //    import a specific shell's internals.
    if (
      file.startsWith("src/features/") &&
      /shells\/(bar|portal)/.test(spec) &&
      !/shells\/(bar|portal)\/capabilities$/.test(spec)
    ) {
      problems.push(`${file}: imports "${spec}" — features/ must stay shell-agnostic (use useShell(), not a shell's internals)`);
    }

    // 3. Supabase client stays private to src/lib/supabase/.
    if (
      /^@supabase\/(supabase-js|ssr)$/.test(spec) &&
      !file.startsWith("src/lib/supabase/")
    ) {
      problems.push(`${file}: imports "${spec}" directly — only src/lib/supabase/{client,server}.ts may do this`);
    }
  }
}

if (problems.length) {
  fail(["check:arch failed:", ...problems.map((p) => `  - ${p}`)]);
}

console.log(`check:arch: ok (${files.length} files scanned)`);
