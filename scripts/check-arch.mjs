#!/usr/bin/env node
// check:arch — CLAUDE.md → Verificatie: "shells geïsoleerd, features
// shell-onwetend, Supabase-client privé". See scripts/lib/scan.mjs for
// what this is and isn't (imports via the TypeScript AST, the directive and
// secret-name checks still regex over comment-stripped source).
import {
  walk,
  read,
  importsOf,
  importRefsOf,
  hasNonLiteralImport,
  startsWithServerOnly,
  resolveSpec,
  stripComments,
  fail,
} from "./lib/scan.mjs";

const root = process.cwd();
const files = walk(`${root}/src`, root);
const problems = [];

// Matches the `"use client"` / `'use client'` directive, which must be the
// first statement in a module — so anchor at the start, allowing only
// leading comments/whitespace before it. Checked against comment-stripped
// source so a file that merely *mentions* the directive in a comment isn't
// treated as one.
const USE_CLIENT_RE = /^\s*["']use client["']/;

// Client modules: the directive above, or a file under one of these
// directories — everything under hooks/queries, features, shells and
// components is client-side by construction in this app, whether or not the
// individual file carries the directive.
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
  const source = read(root, file);
  const specs = importsOf(source, file);

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

// 4. Server-only modules never reach a client bundle (ADR 0021, replaces
//    the old direct-import rule for admin.ts). The service-role client
//    bypasses RLS entirely: `auth.uid()` is empty on it, so every RPC
//    actorcheck (ADR 0002) silently sees "no actor" (ADR 0006). The
//    `import "server-only"` marker makes `next build` fail for any client
//    import, also an indirect one; this rule checks the same thing
//    transitively before the build (pre-commit), with the import chain in
//    the message. Type-only imports are skipped (erased at compile time);
//    package specifiers aren't followed.
const SERVER_ONLY_SPEC = "server-only";
const REQUIRED_SERVER_ONLY = [
  "src/lib/supabase/admin.ts",
  "src/lib/supabase/server.ts",
  "src/lib/supabase/portalServer.ts",
];
const SECRET_KEY_NAME = "SUPABASE_SECRET_KEY";
const SECRET_KEY_FILE = "src/lib/supabase/admin.ts";
// Reachability uses `marked` (the marker anywhere — `next build` fails on
// that too); the REQUIRED_SERVER_ONLY check demands the stricter form: the
// marker as the module's first statement, only directives (`"use strict";`)
// before it (startsWithServerOnly, on the AST).

const fileSet = new Set(files);
// Parsed once per file: resolved runtime edges, marker, client-ness.
const info = new Map();
function infoOf(file) {
  let i = info.get(file);
  if (i) return i;
  const source = read(root, file);
  const code = stripComments(source);
  const refs = importRefsOf(source, file);
  i = {
    source,
    code,
    marked: refs.some((r) => !r.typeOnly && r.spec === SERVER_ONLY_SPEC),
    markedFirst: startsWithServerOnly(source, file),
    isClient: USE_CLIENT_RE.test(code) || CLIENT_ONLY_DIRS.some((d) => file.startsWith(d)),
    edges: [
      ...new Set(
        refs
          .filter((r) => !r.typeOnly)
          .map((r) => resolveSpec(file, r.spec, fileSet))
          .filter(Boolean)
      ),
    ],
  };
  info.set(file, i);
  return i;
}

for (const required of REQUIRED_SERVER_ONLY) {
  if (!fileSet.has(required)) {
    problems.push(`${required}: listed in REQUIRED_SERVER_ONLY but missing — update the list deliberately (ADR 0021)`);
  } else if (!infoOf(required).markedFirst) {
    problems.push(`${required}: must start with import "server-only" (ADR 0021)`);
  }
}

for (const file of files) {
  const { source, code, isClient } = infoOf(file);

  if (hasNonLiteralImport(source, file)) {
    problems.push(`${file}: non-literal import()/require() — check:arch can't follow it (ADR 0021)`);
  }

  // ADR 0006 → Beslissing: only admin.ts reads the secret key.
  if (file !== SECRET_KEY_FILE && code.includes(SECRET_KEY_NAME)) {
    problems.push(`${file}: mentions ${SECRET_KEY_NAME} — only ${SECRET_KEY_FILE} may read it (ADR 0006)`);
  }

  if (!isClient) continue;

  // Breadth-first: the first time a file is reached is via a shortest chain.
  const prev = new Map([[file, null]]);
  const queue = [file];
  while (queue.length) {
    const current = queue.shift();
    if (infoOf(current).marked) {
      const chain = [];
      for (let n = prev.get(current); n !== null && n !== undefined; n = prev.get(n)) chain.unshift(n);
      const via = chain.slice(1);
      const where =
        current === file
          ? " (the client module itself is marked)"
          : via.length
            ? ` via ${via.join(" → ")}`
            : "";
      problems.push(
        `${file}: reaches server-only ${current}${where} — server-only modules never enter a client bundle (ADR 0021); move shared types/rules to a separate module`
      );
    }
    for (const next of infoOf(current).edges) {
      if (!prev.has(next)) {
        prev.set(next, current);
        queue.push(next);
      }
    }
  }
}

if (problems.length) {
  fail(["check:arch failed:", ...problems.map((p) => `  - ${p}`)]);
}

console.log(`check:arch: ok (${files.length} files scanned)`);
