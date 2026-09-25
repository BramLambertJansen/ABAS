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
