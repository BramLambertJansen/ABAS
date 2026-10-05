#!/usr/bin/env node
// check:arch — CLAUDE.md → Verificatie: "shells geïsoleerd, features
// shell-onwetend, Supabase-client privé". See scripts/lib/scan.mjs for
// what this is and isn't (regex over source, not a real AST — first pass).
import { walk, read, importsOf, importRefsOf, hasNonLiteralImport, resolveSpec, stripComments, fail } from "./lib/scan.mjs";

const root = process.cwd();
const files = walk(`${root}/src`, root);
const problems = [];

// Matches the `"use client"` / `'use client'` directive, which must be the
// first statement in a module — so anchor at the start, allowing only
// leading comments/whitespace before it. Checked against comment-stripped
// source so a file that merely *mentions* the directive in prose (as
// src/lib/supabase/admin.ts's own warning does) isn't treated as one.
const USE_CLIENT_RE = /^\s*["']use client["']/;

// Server-only is the explicit boundary, including indirect imports (ADR 0021).
const REQUIRED_SERVER_ONLY = [
  "src/lib/supabase/admin.ts", "src/lib/supabase/server.ts",
  "src/lib/supabase/portalServer.ts",
];
const fileSet = new Set(files);
const sources = new Map(files.map((file) => [file, stripComments(read(root, file))]));
const refs = new Map(files.map((file) => [file, importRefsOf(sources.get(file))]));
const marked = new Set(files.filter((file) => refs.get(file).some(
  (ref) => ref.sideEffect && ref.spec === "server-only"
)));
for (const file of REQUIRED_SERVER_ONLY) {
  if (!fileSet.has(file)) problems.push(`${file}: required server-only module is missing (ADR 0021)`);
  else if (!/^\s*import\s*["']server-only["']\s*;/.test(sources.get(file))) {
    problems.push(`${file}: must start with import "server-only" (ADR 0021)`);
  }
}
for (const file of files) {
  if (hasNonLiteralImport(sources.get(file))) {
    problems.push(`${file}: non-literal import()/require() — check:arch can't follow it (ADR 0021)`);
  }
  if (file !== "src/lib/supabase/admin.ts" && sources.get(file).includes("SUPABASE_SECRET_KEY")) {
    problems.push(`${file}: SUPABASE_SECRET_KEY may only be read in src/lib/supabase/admin.ts (ADR 0006)`);
  }
}
const edges = new Map(files.map((file) => [file, refs.get(file)
  .filter((ref) => !ref.typeOnly)
  .map((ref) => resolveSpec(file, ref.spec, fileSet)).filter(Boolean)]));

const CLIENT_ONLY_DIRS = [
  "src/hooks/queries/",
  "src/features/",
  "src/shells/",
  "src/components/",
];

// ADR 0009 (docs/features/portal-login.md → "Cookie-isolatie"): portal code
// must use portalClient.ts/portalServer.ts, never client.ts/server.ts
// (which write/read the shared bar-tablet-device cookie); code outside
// portal must use client.ts/server.ts, never portalClient.ts/portalServer.ts
// (which write/read the isolated "sb-portal-auth-token" cookie). Exactly one
// named exception: src/app/auth/callback/route.ts, the shared mail-callback
// route that must choose between the two *before* the session exchange — a
// bestandspad, not a mapprefix, so a future second shared route would need
// its own explicit addition here.
const PORTAL_ONLY_DIRS = [
  "src/app/portal/",
  "src/shells/portal/",
  "src/features/portal-login/",
  // docs/features/portal-dashboard.md (#16) → Betrokken shell, "Gewijzigd":
  // een vierde, portal-only featuremap naast portal-login/ — geen bar-
  // tegenhanger om generiek voor te bouwen, zelfde reden als de andere drie.
  "src/features/portal-dashboard/",
  // docs/features/portal-profiel.md (#17) → Betrokken shell, "Gewijzigd":
  // het Account-tabblad en zijn sheets, zelfde reden als portal-dashboard/.
  "src/features/portal-profiel/",
];
const SHARED_AUTH_CALLBACK_FILE = "src/app/auth/callback/route.ts";

// docs/features/portal-login.md's own "Cookie-isolatie" section names only
// the three directories above, but the same spec also places the portal
// query hooks (usePortalLogin.ts/usePortalSession.ts/
// usePortalWachtwoordHerstellen.ts) under src/hooks/queries/ — outside that
// list — where they must import portalClient.ts to read the isolated
// portal session, exactly like useBeheerLogin.ts/useBeheerSession.ts import
// client.ts from that same directory today. Read literally, the "drie
// mappen" rule would flag those hooks' own, required import. Resolved here
// by treating a src/hooks/queries/ file as portal-only when its name starts
// with "usePortal" — a filename pattern, not a blanket exemption for the
// whole directory, so a non-portal hook accidentally importing portalClient
// is still caught. Flagged to the Architect/Bram as a spec gap, not a
// silent reinterpretation — see the Developer's PR description.
function isPortalOnlyFile(file) {
  if (PORTAL_ONLY_DIRS.some((d) => file.startsWith(d))) return true;
  if (file.startsWith("src/hooks/queries/")) {
    const basename = file.slice("src/hooks/queries/".length);
    return basename.startsWith("usePortal");
  }
  return false;
}

for (const file of files) {
  const source = sources.get(file);
  const specs = importsOf(source);
  const isClientModule =
    USE_CLIENT_RE.test(stripComments(source)) ||
    CLIENT_ONLY_DIRS.some((d) => file.startsWith(d));

  if (isClientModule) {
    const seen = new Set([file]);
    const queue = [[file]];
    for (let i = 0; i < queue.length; i++) {
      const chain = queue[i];
      const target = chain.at(-1);
      if (marked.has(target)) {
        const via = chain.slice(1, -1).join(" -> ") || "direct import";
        problems.push(`${file}: reaches server-only ${target} via ${via} — server-only modules never enter a client bundle (ADR 0021); move shared types/rules to a separate module`);
      }
      for (const next of edges.get(target)) {
        if (!seen.has(next)) { seen.add(next); queue.push([...chain, next]); }
      }
    }
  }

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

    // 5. Portal/bar-beheer session cookie isolation — see PORTAL_ONLY_DIRS/
    //    isPortalOnlyFile above for the full rationale (ADR 0009).
    if (isPortalOnlyFile(file) && /^@\/lib\/supabase\/(client|server)$/.test(spec)) {
      problems.push(`${file}: imports "${spec}" — portal code must use portalClient.ts/portalServer.ts instead (ADR 0009)`);
    }

    if (
      !isPortalOnlyFile(file) &&
      file !== SHARED_AUTH_CALLBACK_FILE &&
      /^@\/lib\/supabase\/(portalClient|portalServer)$/.test(spec)
    ) {
      problems.push(`${file}: imports "${spec}" — only portal code (or ${SHARED_AUTH_CALLBACK_FILE}) may use portalClient.ts/portalServer.ts (ADR 0009)`);
    }
  }
}

if (problems.length) {
  fail(["check:arch failed:", ...problems.map((p) => `  - ${p}`)]);
}

console.log(`check:arch: ok (${files.length} files scanned)`);
