#!/usr/bin/env node
// check:arch — CLAUDE.md → Verificatie: "shells geïsoleerd, features
// shell-onwetend, Supabase-client privé". See scripts/lib/scan.mjs for
// what this is and isn't (regex over source, not a real AST — first pass).
import { walk, read, importsOf, stripComments, fail } from "./lib/scan.mjs";

const root = process.cwd();
const files = walk(`${root}/src`, root);
const problems = [];

// Matches the `"use client"` / `'use client'` directive, which must be the
// first statement in a module — so anchor at the start, allowing only
// leading comments/whitespace before it. Checked against comment-stripped
// source so a file that merely *mentions* the directive in prose (as
// src/lib/supabase/admin.ts's own warning does) isn't treated as one.
const USE_CLIENT_RE = /^\s*["']use client["']/;

// The service-role client bypasses RLS entirely. `auth.uid()` is empty on
// it, so every RPC actorcheck (ADR 0002) silently sees "no actor" — and
// SUPABASE_SECRET_KEY isn't inlined into a client bundle (Next.js only
// inlines NEXT_PUBLIC_*), so an import from client code fails at runtime
// with an unhelpful error instead of leaking anything. Either way it's
// never correct. Flagged by directory as well as by directive: everything
// under hooks/queries, features, shells and components is client-side by
// construction in this app, whether or not the individual file carries the
// directive.
const ADMIN_CLIENT_RE = /(^|\/)lib\/supabase\/admin$|^\.\.?\/.*supabase\/admin$/;
const CLIENT_ONLY_DIRS = [
  "src/hooks/queries/",
  "src/features/",
  "src/shells/",
  "src/components/",
];

for (const file of files) {
  const source = read(root, file);
  const specs = importsOf(source);
  const isClientModule =
    USE_CLIENT_RE.test(stripComments(source)) ||
    CLIENT_ONLY_DIRS.some((d) => file.startsWith(d));

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

    // 3. Supabase client stays private to src/lib/supabase/ — with one
    //    narrow exception: src/middleware.ts (device-login bootstrap,
    //    issue #32) has its own request/response cookie API that
    //    server.ts's next/headers-based helper can't be reused for.
    if (
      /^@supabase\/(supabase-js|ssr)$/.test(spec) &&
      !file.startsWith("src/lib/supabase/") &&
      file !== "src/middleware.ts"
    ) {
      problems.push(`${file}: imports "${spec}" directly — only src/lib/supabase/{client,server}.ts (or src/middleware.ts) may do this`);
    }

    // 4. The service-role client never reaches client-side code. Closes
    //    the hole ADR 0006 → "Signaal voor een mogelijke toekomstige gate"
    //    named and src/lib/supabase/admin.ts's own header warned about,
    //    which until now was reviewer discipline only (app-review
    //    2026-09-21).
    if (isClientModule && ADMIN_CLIENT_RE.test(spec)) {
      problems.push(`${file}: imports "${spec}" — the service-role client (src/lib/supabase/admin.ts) is server-only; it bypasses RLS and has no auth.uid(). Call it from a Route Handler/Server Action via src/lib/ instead (ADR 0006)`);
    }
  }
}

if (problems.length) {
  fail(["check:arch failed:", ...problems.map((p) => `  - ${p}`)]);
}

console.log(`check:arch: ok (${files.length} files scanned)`);
