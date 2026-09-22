# Architecture — ABAS

Living document — decisions land here first (see `CLAUDE.md` → Werkstraat).
`CLAUDE.md` stays the short, gate-complementing summary; this is where the
detail behind it lives.

## Bronmateriaal

The current design source is a Claude Design click-prototype (`dc-runtime`
templating, not portable code), exported into this repo as one self-contained
top-level directory: **`/designs/`** (moved here 2026-08-26 from a generic
`project/` + root-level `README.md`/`chats/` split, precisely so a `find` or
a directory listing lands on it without prior context — this *is* the "where
do I look for the design" answer for any agent working in this repo).

- `designs/README.md` — handoff notes from the design tool.
- `designs/Bar App.dc.html` — the bar-facing app: Verkoop (sales), Dienst
  (shift), Leden (members), Assortiment (products), plus screens for roles
  and features not yet in scope here (see "Wat het prototype deed maar hier
  nog niet is besloten" below).
- `designs/Lid App.dc.html` — the member-facing portal.
- `designs/chats/*.md` (43 files) — the design conversations; useful for
  *why*, not binding on *what we build*. Index by topic:
  - Multi-person shifts / "wie geeft uit" at checkout: `chat18.md`, `chat19.md`
  - Permission model iteration (bardienst/barmanager/beheerder/boekhouder,
    PIN step-up): `chat21.md`, `chat25.md`, `chat26.md`, `chat35.md`, `chat42.md`
  - Activity types tied to a shift: `chat36.md`–`chat38.md`
  - Report builder / bookkeeper exports: `chat39.md`, `chat41.md`
  - Overall bar-vs-beheer flow rationale: `chat19.md`–`chat21.md`, `chat24.md`, `chat25.md`

**Also findable in the running app, live**: `/design` (`src/app/design/`)
renders `/designs/` from inside ABAS itself, for looking at it visually
rather than reading HTML. It's read straight off disk on every request —
`src/app/design/files/[...path]/route.ts` is a `force-dynamic` route handler
that streams anything under `/designs/` live (allowlisted to that one
directory, resolved-path-must-stay-inside-root guarded) — so a fresh Claude
Design export dropped in shows up on refresh, no rebuild, no copy to keep in
sync. The prototype's own relative asset imports (`./support.js`,
`./image-slot.js`) resolve correctly because the route mirrors the repo's
own directory layout (`/design/files/designs/<name>` is a sibling of
`/design/files/designs/support.js`), not because anything was rewritten.
Deliberately outside `src/shells/` and `src/features/` — this is tooling for
building the app, not a shell or a feature, so it's exempt from `check:arch`'s
shell-isolation rules and from `e2e/a11y.spec.ts`'s route list (it renders a
third-party prototype file, not a screen we control the markup of). The repo
tree (`/designs/`) is the primary way to find this, and works with no app
running at all — the `/design` route is a secondary, visual convenience on
top of the same files.

**Auth-gated in production (2026-08-26)**: `/design` is now behind a single
shared HTTP Basic Auth password (`DESIGN_PREVIEW_PASSWORD`), enforced in
`src/middleware.ts`'s `designPreviewGate` — but only for a production build
(`next build && next start`, i.e. every real deploy including Vercel);
`next dev` stays ungated on purpose, since this route exists for agents and
Bram to use while building. If `DESIGN_PREVIEW_PASSWORD` isn't set in a
production environment, `/design` 404s instead of being left open. Not tied
to Supabase/member auth: this is a build-tool preview, not a member- or
beheerder-facing feature, and no beheerder-role check exists yet elsewhere
in the app to hang this off.

Per `CLAUDE.md`: the prototype governs the *first* build of a screen's UX: once
built, the in-app design system is truth and departing from the prototype is
normal evolution, not a defect.

## Shells (settled, from CLAUDE.md)

One app, two shells:

- `shells/bar` — tablet/desktop only, no phone fallback.
- `shells/portal` — phone-first, usable on desktop too.

`features/` components are shell-agnostic: they read `useShell()` →
`{ density, overlay, columns }` and never branch on device directly
(`isMobile`/`matchMedia`/`userAgent` are banned by `check:policy`).

**`shells/bar` is a PWA (settled, 2026-08-26)**: `public/manifest.webmanifest`
+ `public/icons/` (generated via `node scripts/generate-pwa-icons.mjs`, using
`sharp` — already a transitive `next` dependency, no new one added) +
`public/apple-touch-icon.png`, linked only from `src/app/(bar)/layout.tsx`'s
`metadata`/`viewport` exports — not the root layout — so `shells/portal`
(a sibling route segment, not a child of `(bar)`) never gets the manifest
link or theme-color meta. Verified in the built HTML: `/` renders the
`<link rel="manifest">` / `<meta name="theme-color">` / apple-touch-icon
tags, `/portal` and `/_not-found` don't. No service worker, no offline
caching — deliberately out of scope per CLAUDE.md. Icons: two purposes
(`any` — rounded badge matching the in-app logo; `maskable` — edge-to-edge
fill with content in the 80% safe zone) at 192/512, plus a 180×180
apple-touch-icon (iOS ignores manifest icons for "Add to Home Screen").
See issue [#4](https://github.com/BramLambertJansen/ABAS/issues/4).

**Built (2026-08-24, initial scaffold)**:
- Next.js 15 (App Router) + TypeScript + Tailwind CSS. shadcn/ui not added
  yet — nothing has needed a dialog/dropdown primitive so far; add it when
  the first real screen does rather than pre-installing unused components.
- Repo layout, as built: `src/shells/{bar,portal}/` hold each shell's real
  capability values + placeholder home screen; `src/app/(bar)/` and
  `src/app/portal/` are thin Next.js routing wrappers only (a `layout.tsx`
  that mounts `ShellProvider` + a `page.tsx` that re-exports the shell's
  component) — this is what makes `shells/bar` and `shells/portal` literal,
  isolated folders `check:arch` can actually enforce, not just a metaphor.
  `src/features/`, `src/components/`, `src/hooks/queries/` exist and are
  empty (each has a README explaining its rule) until the first spec builds
  into them. `src/lib/shell/` holds `useShell()`; `src/lib/supabase/` holds
  the only two files allowed to import the Supabase SDK.
- `supabase/migrations/0001_init.sql` implements the schema below in full:
  every table from "Money & attribution", RLS enabled + `authenticated`
  granted `select`-only via policy, money tables additionally `REVOKE`d,
  and the `start_shift`/`add_shift_member`/`remove_shift_member`/
  `place_order`/`top_up` RPCs. `supabase/seed.sql` has demo data (PIN `1234`
  for every seeded bar/beheer member). `supabase/tests/` has pgTAP coverage
  for the money RPCs' happy paths and negative cases (insufficient balance,
  `served_by` off-roster, direct-write REVOKE).
- `scripts/check-{arch,policy,rls}.mjs` are real (regex-based, not a full
  AST — see each file's own header for the tradeoff) first-pass
  implementations of the three static gates, wired into `npm run check:all`
  and `.github/workflows/ci.yml`.

**WCAG-AA-gate (settled, 2026-08-26)**: `check:a11y` (`playwright test`) runs
`e2e/a11y.spec.ts` — an `@axe-core/playwright` scan (`wcag2a` + `wcag2aa`
tags) against every shell's entry route (`/`, `/portal`), asserting zero
violations. Wired into `npm run check:all` (after `check:rls`, before
`db:test`) and `.github/workflows/ci.yml` (which runs
`npx playwright install --with-deps chromium` first — CI has no browser
pre-installed). `eslint.config.mjs` also extends `plugin:jsx-a11y/recommended`
(on top of the smaller warn-only subset `eslint-config-next` already ships),
and `npm run lint` now fails on any warning (`next lint --max-warnings=0`),
not just errors — that's what turns jsx-a11y findings into a real gate
instead of an ignorable warning. This is the gate CLAUDE.md flagged as
missing ("de eerste taak van de Architect-agent bij de eerste echte
sessie" — see issue
[#1](https://github.com/BramLambertJansen/ABAS/issues/1)); CLAUDE.md's
Verificatie table has been updated accordingly and the "doesn't exist yet"
paragraph removed, per its own "wat een gate kan afdwingen staat hier niet"
rule.
- Running this gate against the as-built scaffold caught a real finding, not
  a hypothetical one: `muted.DEFAULT` (`tailwind.config.ts`), taken verbatim
  from the prototype's inline styles, was 3.37:1 on `canvas` at 14px/normal —
  below the 4.5:1 WCAG AA needs. Darkened to `#736d66` (4.79:1, same hue).
  Expect more of these once real screens exist; this gate is what's supposed
  to catch them going forward instead of relying on review.
- `playwright.config.ts` picks up a sandbox's pre-installed Chromium via a
  `PLAYWRIGHT_BROWSERS_PATH`-relative `chromium` symlink when present (some
  sandboxes have no outbound access to fetch Playwright's own pinned
  version); falls through to Playwright's default resolution otherwise
  (i.e. in CI, after the explicit `playwright install` step).

**Verified vs. not**: `npm install`, `typecheck`, `build`, `lint`,
`check:arch`, `check:policy`, `check:rls`, `check:a11y` all actually ran
green in the environment that built this scaffold (`check:a11y` was verified
against the pre-installed sandbox Chromium described above, not yet against
a from-scratch `playwright install` in real CI). `db:test` (pgTAP via
`supabase test db`) did **not** — no Docker daemon was available there, so
the SQL migrations and tests are carefully written but not yet executed
against a real Postgres. That's the first thing to run for real (`supabase
start && npm run db:test`) before trusting the schema.

**Known rough edges in the v1 gate scripts** (fix opportunistically, not
urgent):
- `check:rls`'s "table mentioned in a test" check is a literal string match
  — `top_up` (the RPC) doesn't lexically contain `top_ups` (the table) as a
  test-file mention would need, so that table's coverage is real
  (`top_up.test.sql`, `rls_write_protection.test.sql`) but only found by the
  script because `rls_write_protection.test.sql` happens to spell the table
  name literally. Fragile; a real AST/SQL-parse pass would be sturdier.
- `check:policy`'s device-sniffing regex scans stripped comments too
  crudely to be bulletproof against a string literal containing e.g.
  `"matchMedia"` — unlikely in practice, not hardened against.

**`useShell().columns` (settled, 2026-08-26)**: first real use is the staff
picker on the dienst-starten screen (issue #6) — a CSS grid with
`gridTemplateColumns: repeat(shell.columns, 1fr)`, so `columns` means
literally that: how many equal-width tracks a list/grid component should
lay out, not a breakpoint or a max-item-count. `barCapabilities.columns = 4`
(`src/shells/bar/capabilities.ts`) was already set before this, this just
confirms what a real component does with the number.

**`useShell().overlay` (settled, 2026-08-26)**: first real consumer is
bezetting-beheer (issue #7) — `src/components/Overlay.tsx`, the first
component in what had been an empty `src/components/`, renders a centered
modal-with-backdrop for `overlay === "modal"` (the only value `shells/bar`
has ever set, `barCapabilities.overlay`) and falls through to the same
markup for `"sheet"` rather than building an untested second branch — no
`shells/portal` consumer exists yet to build or verify a real bottom sheet
against. Required regardless of variant: `role="dialog"`, `aria-modal`,
labelled by title, focus-trap, focus in/out on mount/unmount, Escape and
backdrop-click both close. Reused as-is (no new decision) by issue #8's
sale-checkout confirmation — see `docs/features/verkoop.md`. `density`
(`"comfortable" | "compact"`) still has no real consumer as of #8 either;
leave that one open until a screen actually needs to branch on it, same
"don't build ahead of a second real case" reasoning as the `"sheet"` branch
above.

**First multi-screen bar navigation (settled, 2026-08-26)**: issue #8 is the
first time `shells/bar` needed more than one screen behind an open shift.
`src/features/verkoop/DienstTabs.tsx` renders a simple `role="tablist"` tab
bar (Verkoop, default/active; Dienst, the existing #7 `DienstActief`
content) — deliberately not the prototype's dark icon-rail chrome, per
`docs/features/verkoop.md` → Navigatie ("the spec fixes that navigation
exists, not the pixels"). `DienstStarten.tsx` hands off to `DienstTabs`
entirely once a shift is open, rather than branching inside its own dark
PIN-entry layout. Each tab's content is mounted/unmounted as the active tab
changes (not hidden via CSS) — same lifecycle-based approach as
`Overlay.tsx` — so returning to a tab always re-fetches fresh data instead of
showing a stale snapshot. Accepted trade-off of that choice: the Verkoop
tab's in-progress cart/selected-member state is lost on switching away and
back, since it lives in `VerkoopScherm`'s local state, not lifted above
`DienstTabs`. Flagged during PR #41 review and deliberately not fixed there
(would mean lifting checkout state above the tab boundary, a real design
choice, not a quick fix) — tracked as
[issue #43](https://github.com/BramLambertJansen/ABAS/issues/43) for a
future decision on whether/how to persist it.

## Money & attribution (settled, from CLAUDE.md)

- All balance-affecting writes go through `SECURITY DEFINER` RPCs —
  `place_order(lines, member_id | null)` and `top_up(member_id, amount,
  method)` — which compute the amount server-side, check balance (member
  balance + the admin-configured negative limit), and write the transaction
  in one statement. The client never sends a computed total.
- Money tables are `REVOKE`d from `authenticated` — no direct table access is
  *possible*, not just discouraged.
- `served_by` is chosen by the operator from the active shift's roster
  (`bezetting`) at checkout time — a plain select, not a PIN. The RPC still
  validates that the given `served_by` member_id is actually on that shift's
  roster and rejects anything else, but does not verify that the selecting
  person is physically the one who made the choice. Deliberate trade-off:
  stops attribution to someone not on shift, doesn't stop someone on shift
  claiming a colleague's sale. See "Dienst & bezetting" below.
- `order_lines.unit_cents` freezes price at order time; later price changes
  don't retroactively change historical order totals.
- Negative balance is allowed up to a systemwide limit, itself stored as an
  application setting a `beheerder` manages (not per-member). A limit of €0 is
  a valid setting and behaves as "never negative" — but that's a chosen
  value, not a hardcoded rule. Separately, a €10 "low balance" warning
  threshold is fixed/systemwide (not a beheerder setting).
- A cash top-up is capped at €500 per booking, enforced inside `top_up`
  (`amount_exceeds_max`), with a client-side confirmation step above €100.
  Settled 2026-09-21, see ADR-less product decision in
  `docs/features/opwaarderen.md` → "Besloten: bovengrens en
  bevestigingsstap". Deliberately a guard on the cash-desk RPC and not a
  check-constraint on `top_ups.amount_cents` — #23's payment-provider path
  has an actual payment as proof and shouldn't inherit this limit.

**Leestoegang per rol (settled, 2026-09-21)**: ADR
[0007](adr/0007-rol-lid-leest-alleen-eigen-rijen.md) — the blanket
`for select to authenticated using (true)` from `0001_init.sql` now only
applies to bar/beheer sessions and the shared device session. A session that
resolves to a `members` row with role `lid` sees only its own rows in
`members`/`orders`/`order_lines`/`top_ups`
(`0015_lid_leest_alleen_eigen_rijen.sql`); `shifts`/`shift_members`/
`products`/`app_settings` stay readable for everyone, deliberately. Strictly
narrowing: no existing session type changed behaviour, which
`supabase/tests/rls_lid_eigen_rijen.test.sql` asserts explicitly rather than
assumes. This is *not* the device-session hardening — that still belongs to
#15, together with the cookie-scoping item below.

**Settled (2026-08-24)**:
- **Single organization.** ABAS is for Aurora only — no `org_id`, no
  multi-tenant scoping. RLS policies are written against a single club's
  data. (Revisit as a real architecture change, with an ADR, if ABAS is ever
  meant to serve more than one vereniging — don't creep towards multi-tenant
  incidentally.)
- **Shared bar-tablet session mechanism**: a dedicated Supabase Auth account
  per physical tablet, provisioned once by the vereniging (Supabase
  Studio/CLI). The app signs in as that device account and stays signed in;
  RLS grants that account the ability to call `place_order`/`top_up` with any
  valid staff PIN. Individual attribution still only ever comes from the PIN
  checked inside the RPC — the device account identifies "a legitimate bar
  tablet", never a specific person. **This covers bardienst work only** —
  see "Beheer-sessie (settled, 2026-08-26)" below for why beheer-only writes
  (assortiment, later ledenbeheer) don't use this shared identity.

**Beheer-sessie (settled, 2026-08-26)**: ADR
[0002](adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md) — Bram
corrected the assumption behind the shared device-session model above: a
`beheerder` identity is not shared. The bar-tablet device session (above)
stays as-is for ordinary bardienst work (dienst starten, bezetting, plaatsen
van bestellingen) — but a beheerder-only write (issue #14 Assortimentbeheer,
later ledenbeheer) requires the beheerder to sign in with their own e-mail
(magic link/wachtwoord, same mechanism as portal-login) on a dedicated route
within `shells/bar` (e.g. `/beheer`). Because this repo's session storage
(`@supabase/ssr`, cookie-based) holds exactly one active session per browser,
that login **replaces** the shared device session in the tablet's browser
until an explicit sign-out — not a second, concurrently-active session.
Signing out lets `src/middleware.ts`'s existing `if (!session)` step
re-establish the device session on the next bar-shell request, unchanged.
Beheerder-only RPCs (`create_product`, `update_product_price`,
`set_product_archived`, …) verify the caller via `auth.uid()` →
`members.auth_user_id` → role `beheerder`, replacing the
`p_actor_member_id`/`p_actor_pin`-per-call pattern ADR 0001 introduced (ADR
0001 is superseded, kept for the earlier reasoning). Partially addresses
issue #22 ("alternate bar-shell login methods") — this is an alternate
login, but scoped to beheer actions only; #22 itself is about the bar-shell
PIN flow (#6), which this doesn't touch. See "Auth-methode & modus" below
(ADR 0003) for the corrected scope.

**Settled (2026-08-26)**: this mechanism depends on `members.auth_user_id`
(planned in "Lid-accounts" below, issue #24) and an e-mail login flow
(issue #15) — neither exists in the codebase yet as of this writing.
Whether #14 builds a minimal slice of that itself or waits for #15/#24 to
land first was an open sequencing question — **decided: #14 builds it
itself, minimally** (just the `/beheer` login form + the `auth_user_id`
column + manual provisioning of beheerder Supabase Auth accounts, same
manual pattern as the device account below), not the full portal login flow
(#15) or the self-service invite flow (#24 → "Lid-accounts" below). See ADR
[0003](adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) and
`docs/features/assortimentbeheer.md`.

**Device sign-in mechanism (settled, 2026-08-26)**: found missing during
review of [#30](https://github.com/BramLambertJansen/ABAS/pull/30) — the
paragraph above described the intent, but nothing actually signed the app in
as that account, so every bar-shell read was rejected by RLS regardless of
whether the PIN/RPC logic was correct. Decided (issue
[#32](https://github.com/BramLambertJansen/ABAS/issues/32)): server-side,
not client-side.
- `src/middleware.ts` — on a bar-shell request with no valid session yet,
  signs in as the device account via `supabase.auth.signInWithPassword()`
  server-side, using cookies (`@supabase/ssr`) to persist the session. The
  browser's Supabase client (`src/lib/supabase/client.ts`) shares that same
  cookie-based session, so no hook in `src/hooks/queries/` needed to
  change.
- Credentials live in server-only env vars (`SUPABASE_DEVICE_EMAIL`,
  `SUPABASE_DEVICE_PASSWORD`, no `NEXT_PUBLIC_` prefix) — never compiled
  into the client bundle. Rejected alternative: signing in client-side with
  `NEXT_PUBLIC_*` credentials — simpler, but ships the device password to
  every browser that loads the page instead of keeping it server-only.
- `shells/portal` is excluded by the middleware's route matcher — members
  authenticate themselves there, no device account involved.
- `scripts/check-arch.mjs` has a narrow, named exception for
  `src/middleware.ts` on the "only `src/lib/supabase/` imports the SDK"
  rule — middleware's cookie API is request/response-based, distinct from
  `server.ts`'s `next/headers`-based one, so it can't reuse that helper.
- `src/middleware.ts` also carries `/design`'s unrelated auth gate
  (`designPreviewGate`) — Next.js only runs one middleware per project, so
  it short-circuits there first and falls through to device sign-in for
  everything else. See Bronmateriaal above for what that gate does.

**Accepted risk: device sign-in has no tablet-trust check (2026-08-26)**:
found during review of [#33](https://github.com/BramLambertJansen/ABAS/pull/33)
— `src/middleware.ts` signs in *any* visitor to the deployed bar URL as the
device account, not just the physical tablet. There's no mechanism proving
the request actually comes from Aurora's tablet; anyone who knows the URL
gets read access to members/shifts/orders/balances (writes still require
the PIN inside `place_order`/`top_up`/`start_shift`, unaffected). Decided
(Bram): accept this for the MVP — single club, low stakes — rather than
build a trust mechanism now. Tracked as
[issue #34](https://github.com/BramLambertJansen/ABAS/issues/34) for when
it's worth revisiting (a second tablet, a less trusted deployment context).
Options noted there, not chosen: Vercel Deployment Protection (platform-
level, no code), or a shared provisioning secret the tablet presents.

**Deferred: device cookie isn't scoped away from `shells/portal` (2026-08-26)**:
also found during that review — the middleware's route matcher keeps it
from *running* on `/portal`, but the resulting cookie itself isn't scoped
to bar routes, so a browser that visited the bar shell first would send it
to `/portal` too. Harmless today (portal has no real session of its own to
collide with yet — scaffold only), but needs solving once
[#15](https://github.com/BramLambertJansen/ABAS/issues/15) (portal-login)
gives the portal a real session to isolate from. Decided (Bram): land the
fix there, not here — designing isolation before there's a second session
to isolate from would be guessing. See #15's acceptance criteria.

**PIN storage/hashing (settled, 2026-08-26)**: confirmed by Bram (issue
[#3](https://github.com/BramLambertJansen/ABAS/issues/3)) — the assumption
below was already what `0001_init.sql` implemented, this makes it a decision
instead of an assumption.
- PINs are hashed via `pgcrypto`'s `crypt()`/`gen_salt('bf')` in
  `members.pin_hash`, never stored or compared in plaintext. `start_shift`
  checks `crypt(p_pin, pin_hash) = pin_hash` server-side inside the
  `SECURITY DEFINER` RPC — the client only ever sends the entered PIN.
- Format: 4 digits, matching the prototype's numpad demo (`DEMO_PIN =
  '1234'`). Enforced by the numpad UI (issue #6) restricting entry to 4
  digits, not by a schema constraint on `pin_hash` — the column stores a
  hash, not the PIN itself, so there's nothing shaped like "4 digits" left
  to constrain there. A wrong-length attempt just fails `crypt()` comparison
  like any other wrong PIN.
- No lockout/rate-limit in MVP. Every attempt is checked independently; add
  a lockout later if it turns out to be needed, not preemptively.
- Negative-test coverage: `supabase/tests/start_shift.test.sql`.

**Local/CI device account (settled, 2026-08-26)**: `supabase/seed.sql` now
inserts a fixed `auth.users`/`auth.identities` row (`device@aurora.local`,
local-only password) purely so `supabase start` in CI/local dev has an
account to sign in as — without it, `src/middleware.ts` never gets a
session, every RLS-protected read comes back empty, and any e2e flow past
the login screen (`e2e/a11y.spec.ts`'s bezetting-overlay/verkoop scans)
times out waiting for data that can never load. Root-caused after a real
CI run (32998590441, off #38) failed on exactly this — not an a11y
regression. `.github/workflows/ci.yml` exports matching
`SUPABASE_DEVICE_EMAIL`/`SUPABASE_DEVICE_PASSWORD`. Production is
unaffected: those two env vars stay real secrets there, naming Aurora's
actual provisioned account, never this seeded one (`seed.sql` only runs on
local `supabase start`/`db reset`, never against a remote/production
project — same guarantee the existing member/product demo data already
relies on).

Getting the device sign-in to actually succeed also required flipping
`supabase/config.toml`'s `[auth]`/`[auth.email]` `enable_signup` from
`false` to `true` — a known GoTrue quirk (`supabase/auth#330`, still open):
`enable_signup = false` doesn't just block *new* signups, it disables the
email provider's login path too (`signInWithPassword` failed with "Email
logins are disabled" even for this pre-existing, directly-inserted
account). `config.toml` only governs the local `supabase start` stack
(nothing in this repo runs `supabase config push` against the hosted
project), so this has no effect on production's real signup policy.
**Flag for #15 (portal-login)**: if the hosted project's dashboard ever
sets its own signup toggle to closed, password login may silently break
for existing members too by the same GoTrue behavior — worth confirming
against the real project before shipping password login there.

**Still open**:
- **Device account provisioning flow (production)**: who creates the
  per-tablet Supabase Auth account and how (manual via Studio for the
  single Aurora tablet today; needs a real flow if a second tablet is ever
  added). Fine to leave manual for now given single-tenant, single-club
  scope — unrelated to the local/CI seeding above, which only ever targets
  the local stack.

## Auth-methode & modus (bar vs. beheer) (settled, 2026-08-26)

ADR [0003](adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)
generalizes the "beheer-sessie" mechanism above: e-mail/wachtwoord login
isn't a beheer-specific concept, it's one of two methods (PIN or
e-mail/wachtwoord) a `bardienst`/`beheerder` member picks for their own
account — either/or, per member, never both, no system-wide setting, no
fixed method↔mode coupling. After signing in, whichever method was used,
the signed-in person picks a **mode: bar or beheer** — modes are separate
instances, not something you switch inside one session; changing mode means
signing out and back in (a generalization of the single-session-per-browser
replace-not-coexist mechanism above, not a new mechanism).

Bar-modus itself, however signed into, stays exactly what already exists:
`start_shift`/`add_shift_member`/`remove_shift_member` (issues #6/#7) and
`served_by`-attribution at checkout are unchanged. **Only the beheer side of
this is actually built today**: `/beheer`'s e-mail login (issue #14). PIN
via the shared device session (issue #6/#32/#33) remains the only built way
into bar-modus — a per-member auth-method setting and bar-modus reachable
via e-mail/wachtwoord are explicitly deferred to a new, not-yet-numbered
issue (see ADR 0003 → scope-splitsing), so as not to re-open #6/#32's
already-merged behavior inside #14.

This also revises `docs/features/dienst-starten.md` → "Expliciet buiten
scope"'s claim that the prototype's bar/beheer modus-keuze "vervalt" — that
held under the assumption (since corrected by ADR 0002) that there'd never
be a separate beheer session. The mode concept is real again at the
architecture level; #6's screens themselves are unaffected, see ADR 0003.

## Dienst & bezetting (settled, 2026-08-24)

Revives the prototype's "crew"/"wie werkt er mee" concept (`chat18.md`,
`chat19.md`), simplified: no per-order PIN, no "wie geeft uit" hard-block
(see open item below on whether the select is required or defaults).

- Starting a shift (`dienst`) requires the starting member's own PIN — this
  is the one real authentication event per shift.
- That member then builds the shift's roster (`bezetting`): other members
  added from the member list. Adding someone to the roster does **not**
  require their PIN or any confirmation from them.
- At checkout, the operator picks who rang up the sale from the roster.
  `place_order`/`top_up` accept a `served_by` parameter and the RPC checks it
  against the shift's roster server-side (`REVOKE`d table, only the RPC can
  read/write shift-roster membership) — an id not on the roster is rejected.
- This is explicitly *not* proof of identity, just a constrained self-report.
  Anyone in the roster can attribute a sale to any other roster member.
  Accepted trade-off — see `CLAUDE.md` → Architectuurbeslissingen.

**Settled (2026-08-24)**:
- The `served_by` select is **required whenever the roster has 2+ people**
  (blocks checkout until chosen, mirrors the prototype's `serverMissing()`
  gate) and **auto-attributed to the sole member when the roster is just the
  shift-starter**, no select shown.
- The roster **can change mid-shift** — members can be added to or removed
  from the active shift's `bezetting` at any point, not just at shift start.

## Roles (settled, from CLAUDE.md)

Exactly three: `lid`, `bardienst`, `beheerder`. `beheerder` is a superset of
`bardienst` (no separate admin app/shell — beheerder works inside
`shells/bar`). This is a deliberate simplification vs. the prototype, which
grew to five roles (`barmanager`, `boekhouder` also existed there) — those are
**not** carried forward unless a future feature request reintroduces them.

## Lid-accounts (settled, 2026-08-25)

Een `lid`-record (naam, saldo, …) bestaat onafhankelijk van een Supabase
Auth-account — bardienst kan een lid aanmaken en laten bestellen/opwaarderen
zonder dat er ooit een e-mailadres of portal-account bij hoort.

- Een e-mailadres bij een lid is optioneel. Voor een `bardienst`- of
  `beheerder`-lid met een ingevuld e-mailadres kan een beheerder vanuit
  Ledenbeheer handmatig een magic-link-invite (opnieuw) laten versturen via
  `supabase.auth.admin.inviteUserByEmail()` (server-side, secret key) — een
  inloglink voor dit lid. **(Herzien, 2026-09-21, PR #62-review):** deze
  link stelt geen wachtwoord in — er is geen wachtwoord-instelscherm (dat is
  issue #17, niet gebouwd); de link logt het lid alleen in. Dit gebeurt
  server-side vanuit `src/lib/supabase/admin.ts` — een derde, eigen bestand
  naast
  `client.ts`/`server.ts`, niet een uitbreiding van een van beide — per de
  bestaande regel dat elk bestand onder `src/lib/supabase/` de Supabase SDK
  mag importeren (geen vaste lijst van twee bestandsnamen meer). Zie [ADR
  0006](adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  voor waarom dit een eigen bestand is (service-role, omzeilt RLS volledig,
  nooit vanuit een `"use client"`-bestand) en
  `docs/features/lid-account-invite.md` voor de volledige flow
  (`src/lib/inviteMember.ts`, `src/app/(bar)/beheer/invite/route.ts`).
- **Uitsluitend een handmatige knop, geen automatisch gedrag bij het
  opslaan van een (nieuw) e-mailadres.** Bewuste scope-verkleining t.o.v.
  het oorspronkelijke, hier eerder beschreven plan ("automatisch bij de
  allereerste keer opslaan") — Bram heeft dat bij de acceptatie van #24
  ingeperkt tot een pure knop-trigger, zie
  `docs/features/lid-account-invite.md` → "Besloten door Bram". Automatisch-
  bij-opslaan blijft een mogelijke latere uitbreiding, geen afgesloten optie.
- **Alleen `bardienst`/`beheerder`-leden zijn eligible, nooit `lid`.**
  Portal-login (#15) bestaat nog niet, dus een `lid`-rol invite zou nergens
  op een werkende afrondroute landen (`bardienst`/`beheerder` hebben die al:
  `/beheer/callback`). `lid`-rol invites volgen pas met #15.
- Een beheerder kan vanuit Ledenbeheer altijd (opnieuw) een invite laten
  versturen zolang het doellid nog geen gekoppeld account heeft — voor een
  lid dat de eerste mail miste, én voor bestaande/geseede leden die nog
  nooit een invite kregen. Geen automatische bulk-uitnodiging met
  terugwerkende kracht: die leden krijgen pas een link op het moment dat een
  beheerder dat handmatig triggert.
- Koppeling `members`-rij ↔ `auth.users`-rij via het nullable
  `members.auth_user_id`-veld (nooit een directe tabel-write). **(Herzien,
  2026-09-21, PR #62-review, Bug 1-fix):** vastgelegd door de RPC
  `link_invited_member_account`, aangeroepen vanuit `/beheer/callback` met
  de sessie van **het lid zelf**, op het moment dat het de uitnodiging
  daadwerkelijk aanklikt en accepteert — niet meer bij het versturen (de
  eerdere `mark_member_invited` zette `auth_user_id` al bij het versturen,
  wat de hieronder genoemde tussenstaat onbereikbaar maakte). Het versturen
  zelf zet voortaan alleen `members.invited_at` (RPC
  `mark_member_invite_sent`, beheerder-actor, zelfde
  `already_linked`-guard als voorheen). Zie
  `docs/features/lid-account-invite.md` → RPC's voor de volledige
  contracten en [ADR 0006](adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
  → Aanvulling voor het nieuwe actor-identificatiepatroon. Een los,
  eveneens nullable `members.invited_at timestamptz`-veld onderscheidt "nog
  niet uitgenodigd" van "uitgenodigd op [datum], nog geen account" in de
  UI — die tussenstaat is met deze herziening ook daadwerkelijk bereikbaar.

**Gebouwd (#24, 2026-09-21)**: zie hieronder, changelog-entry na
"Ledenbeheer" — de bullets hierboven beschrijven de daadwerkelijk gebouwde
staat, niet meer een plan.

**Ook de basis onder beheer-sessies (2026-08-26)**: dezelfde
`auth_user_id`-koppeling is wat ADR
[0002](adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md) gebruikt om een
ingelogde beheerder-sessie terug te herleiden naar een `members`-rij met rol
`beheerder` — zie "Beheer-sessie" onder Money & attribution. Dit maakt #14
(Assortimentbeheer) inhoudelijk afhankelijk van deze koppeling, niet alleen
van de portal.

**Provisioning voor #14 (settled, 2026-08-26)**: #14 bouwt geen
self-service-uitnodigingsflow (die hierboven beschreven `inviteUserByEmail`-stap
hoort bij ledenbeheer, niet gebouwd) en geen portal-inlogflow (#15). Een
beheerder-account voor `/beheer` wordt daarom, net als het
device-account hierboven, **handmatig geprovisioned** (Supabase
Studio/CLI: een Auth-account aanmaken, `members.auth_user_id` handmatig
koppelen) tot #15/#24 landen. Zelfde soort "prima handmatig voor nu,
single-tenant, single-club"-afweging als bij het device-account.
**#24 is inmiddels gebouwd** (zie hieronder) en dekt het geval "een bestaand
`bardienst`/`beheerder`-lid met een e-mailadres krijgt alsnog zelf een
account" — maar bouwt geen eigen provisioning-stap om een gloednieuw lid in
één keer tot beheerder te promoveren met e-mailadres erbij; de eerste
promotie naar `beheerder` (`set_member_role`, #13) plus het e-mailveld
invullen (#57) blijven losse, beheerder-uitgevoerde stappen vóór de
invite-knop iets te doen heeft. Handmatige Studio/CLI-provisioning blijft dus
relevant voor het allereerste beheerder-account op een verse omgeving (er is
dan nog geen bestaande beheerder om de knop te bedienen).

**Assortimentbeheer (gebouwd en gemerged, #14, PR #45, 2026-08-27)**: #14 is
op `main` — producten aanmaken/bewerken en prijzen wijzigen via `/beheer`
(`docs/features/assortimentbeheer.md`, `src/features/assortimentbeheer/`,
`supabase/migrations/0005_assortimentbeheer.sql`), achter de hierboven
beschreven beheer-sessie. Prijswijzigingen raken historie niet:
`order_lines.unit_cents` bevriest de prijs op bestelmoment (`CLAUDE.md`).

**Optioneel e-mailveld + RPC-gated lezen (gebouwd, #57, 2026-09-02)**:
`members.email`, nullable, optioneel bij aanmaken/wijzigen van een lid
(`docs/features/ledenbeheer-email.md`, `supabase/migrations/
0008_ledenbeheer_email.sql`). Een P1-security-bevinding op de bijbehorende
PR bracht aan het licht dat de bestaande brede `members_select`-policy
(`0001_init.sql`, `for select to authenticated using (true)`) dit
PII-veld ook aan de gedeelde bar-tablet-sessie (bardienst) blootstelde —
RLS is row-level, niet column-level, en de gedeelde device-sessie
authenticeert als dezelfde Postgres-rol (`authenticated`) als een
beheerder-sessie. Opgelost met een nieuw, herbruikbaar patroon: **PII-
kolommen worden column-level `REVOKE`d en uitsluitend via een `SECURITY
DEFINER`-RPC met de ADR-0002-actorcheck gelezen** — zelfde structuur als
"geld alleen via RPC", hier toegepast op een leesrecht. Zie [ADR
0004](adr/0004-pii-kolommen-vereisen-rpc-gated-lezen.md)
(`list_members_admin`, migratie `0009`) voor het volledige patroon en de
motivatie; dit patroon geldt voor elke toekomstige PII-kolom op `members`,
niet met terugwerkende kracht voor `name`/`role`/`balance_cents`/`archived`.
*(Aanvulling 2026-09-21: `balance_cents` en de rest van de rij blijven
inderdaad buiten ADR 0004's kolompatroon, maar zijn sinds ADR 0007 wél
rij-niveau afgeschermd voor een `lid`-sessie — zie "Leestoegang per rol"
hierboven. Twee verschillende grenzen om twee verschillende redenen: ADR
0004 schermt één kolom af die zelfs de bar-sessie niet mag zien, ADR 0007
schermt hele rijen af waarvan de zichtbaarheid van de rol van de aanroeper
afhangt.)*

**Saldo opwaarderen (gebouwd, #10, 2026-08-29)**: contant opwaarderen vanuit
het verkoopscherm (`docs/features/opwaarderen.md`,
`src/features/opwaarderen/`), derde consument van `Overlay.tsx`. Geen
migratie nodig — de `top_up`-RPC/`top_ups`-tabel/RLS bestonden al sinds
0001_init.sql, dit was overwegend een client-ticket. Zelfde served_by/
bezetting-patroon als #8 (`place_order`), 1-op-1 gekopieerd i.p.v.
gegeneraliseerd. Client stuurt een hardcoded `p_method = "cash"` — geen
check-constraint op `top_ups.method` (Bram, 2026-08-29): pas toevoegen
zodra #23 (online opwaarderen) een tweede methode introduceert.

**Negatieve-saldolimiet (gebouwd en gemerged, #11, PR #50, 2026-08-29)**: een
instellingenscherm voor de systeembrede negatieflimiet
(`app_settings.negative_limit_cents`), die `place_order` al sinds
`0001_init.sql` las en handhaafde maar tot dit ticket nergens instelbaar was
(`docs/features/negatieve-saldolimiet.md`). Levert `/beheer`'s eerste echte
navigatiestructuur: `BeheerTabs.tsx` (`src/features/assortimentbeheer/`)
rendert een tabbalk (Assortiment | Instellingen) met hetzelfde
`role="tablist"`-/mount-per-tab-patroon als `DienstTabs.tsx` (zie "First
multi-screen bar navigation" hierboven) — het eerste moment waarop `/beheer`
zelf twee schermen achter één sessie krijgt; `Assortimentbeheer.tsx` rendert
`BeheerTabs` in plaats van rechtstreeks `ProductenLijst`, en de "Ingelogd
als…"-indicator/"terug naar bardienst"-link verhuisden naar de gedeelde
chrome boven de tabbalk. `NegatieveLimietInstellingen.tsx` roept de nieuwe
`update_negative_limit`-RPC aan
(`supabase/migrations/0006_negatieve_saldolimiet.sql`), zelfde
ADR-0002-actorcheck-vorm als `create_product`/`update_product_price`/
`set_product_archived` (`auth.uid()` → `members.auth_user_id` → rol
`beheerder`), beheerder-only, geen schemawijziging — de kolom bestond en werd
al gehandhaafd, alleen het schrijfpad ontbrak.

**Dienst afsluiten (gebouwd en gemerged, #12, PR #52, 2026-08-30)**: een
"Dienst afsluiten"-knop/overlay op de "Dienst"-tab
(`DienstActief.tsx`, naast "Bezetting wijzigen"), zesde consument van
`Overlay.tsx` (`docs/features/dienst-afsluiten.md`,
`src/features/dienst-afsluiten/`). Twee nieuwe leeshooks/mutatiehooks:
`useShiftSummary` (platte `select`s op `orders`/`top_ups`, client-side
opgeteld tot omzet + opwaarderingen, geen nieuwe RPC) en `useEndShift`
(mutatiehook rond `end_shift`). Geen migratie, geen nieuwe RPC: `end_shift`
bestond al sinds `0001_init.sql` maar had tot dit ticket geen enkele
UI-trigger — deze feature maakt het schrijfpad dat `place_order`/`top_up`
al sinds `0001_init.sql` handhaven (`shift_not_open` zodra `shifts.ended_at`
niet meer `null` is) voor het eerst daadwerkelijk bereikbaar. Geen
actorcheck op `end_shift` zelf, bewust consistent met
`add_shift_member`/`remove_shift_member`: iedereen op de gedeelde
bar-tablet-sessie tijdens een open dienst mag afsluiten, geen restrictie tot
de dienst-starter. De overlay is gebouwd tegen de gedeelde `StatCard`
(`variant="metric"`)/`MemberPill`-componenten uit #53
("Extract shared UI components", `src/components/`), die vóór #12's merge
al specifiek met deze overlay als consument in gedachten waren gevormd.

**Ledenbeheer (gebouwd en gemerged, #13, PR #55, 2026-09-02)**: een nieuwe
"Leden"-tab in `BeheerTabs.tsx` (naast Assortiment/Instellingen — zie
"Negatieve-saldolimiet" hierboven voor die tabbalk zelf), eigen featuremap
`src/features/ledenbeheer/` (`LedenLijst.tsx`, `NieuwLidOverlay.tsx`,
`LidBeherenOverlay.tsx`), eigen leeshook `useAlleLeden()` naast de bestaande
`useMembers()` (`docs/features/ledenbeheer.md` → Leeshook). Vier nieuwe
beheerder-only RPC's (`supabase/migrations/0007_ledenbeheer.sql`):
`create_member`, `update_member_name`, `set_member_archived`,
`set_member_role` — allemaal ADR 0002's `auth.uid()`-actorcheckvorm, geen
schemawijziging (`members` stond al sinds `0001_init.sql` in de
blanket-`REVOKE`, dus geen nieuwe `REVOKE` nodig, in tegenstelling tot #14's
`products`). Dit is de tweede, laatste helft van de oude "`Leden` admin
screen (member CRUD)"-regel die eerder onder "Wat het prototype deed maar
hier nog niet is besloten" stond (de eerste helft, `Assortiment` CRUD, was
al #14) — die regel is nu verwijderd, beide helften staan op `main`.

**Nieuw precedent: zelfreferentie-guards (`self_archive_forbidden`,
`self_demote_forbidden`).** `set_member_archived` en `set_member_role`
weigeren een schrijfactie waarmee de aanroepende beheerder de eigen
`members`-rij zou archiveren, resp. de eigen rol zou verlagen — beide zouden
de aanroeper bij de eerstvolgende RPC-aanroep of login zonder ingebouwd
RPC-herstelpad buitensluiten (`actor_not_found` resp. `no_admin_role`), en
zijn daarom aan de bron geblokkeerd. Geen eerder precedent kende dit risico
(een product of een negatieflimiet is nooit de aanroeper zelf) — elke
toekomstige beheerder-only RPC die tegen de eigen `members`-rij van de
aanroeper kan schrijven, volgt dit patroon (`docs/features/ledenbeheer.md` →
Randgevallen voor de volledige redenering, inclusief de bewuste keuze om
géén "laatste beheerder"-telling te bouwen).

**Lid-account invite via handmatige knop (gebouwd, #24, 2026-09-21)**: een
"Invite (opnieuw) versturen"-knop in `LidBeherenOverlay.tsx`'s bestaande
"Inloggegevens"-blok, voor een `bardienst`- of `beheerder`-lid met een
e-mailadres en zonder gekoppeld account
(`docs/features/lid-account-invite.md`). Introduceert het derde bestand
onder `src/lib/supabase/`: `admin.ts`, een geïsoleerde, server-only
service-role-client die alleen `SUPABASE_SECRET_KEY` leest — nooit vanuit
een `"use client"`-bestand — voor de eerste `supabase.auth.admin.*`-aanroep
in deze codebase (`inviteUserByEmail`). Zie [ADR
0006](adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
voor het patroon: `inviteUserByEmail()` is geen SQL en kan dus nooit in een
`SECURITY DEFINER`-RPC zitten, dus loopt de uitvoering via een server-only
actie (`src/lib/inviteMember.ts`, aangeroepen vanuit
`src/app/(bar)/beheer/invite/route.ts`, zelf weer aangeroepen door
`useSendMemberInvite()`) die zichzelf, onafhankelijk van elke eerdere
RPC-call, opnieuw verifieert via de sessie-gebonden client vóór de
service-role-client gebruikt wordt. De enige databaseschrijving
(`members.auth_user_id`/`invited_at` koppelen) gaat terug via een nieuwe
RPC, `mark_member_invited` (`supabase/migrations/
0012_lid_account_uitnodigen.sql`, ADR-0002-actorcheckvorm,
`already_linked`-guard tegen dubbele koppeling, `pin_hash`-scrub zoals de
andere `returns members`-RPC's), aangeroepen met de sessie-gebonden client
— nooit de service-role-client, want die heeft geen `auth.uid()`.
Uitsluitend een handmatige trigger, geen automatische invite bij het
opslaan van een e-mailadres (bewuste scope-verkleining, zie de feature-spec
→ "Besloten door Bram"); alleen `bardienst`/`beheerder`-leden zijn
eligible, nooit `lid` (portal-login, #15, bestaat nog niet). `db:test`
dekt `mark_member_invited`'s actorcheck/guards (13 nieuwe assertions,
`supabase/tests/ledenbeheer.test.sql`), niet de `inviteUserByEmail()`-call
zelf — dat blijft een pgTAP-gat, zoals ADR 0006 → Gevolgen al voorzag.

## Wat het prototype deed maar hier nog niet is besloten

Listed for reference only — none of this is scoped in or out yet. Don't build
any of it without a `docs/features/<naam>.md` spec:

- Activity types linked to a shift ("Training" / "Wedstrijddag" / …).
- A dedicated audit-log screen (`Logboek`) — the ledger/transaction table
  itself will exist regardless (it's the money trail), just not a filterable
  UI for it yet.
- Balance corrections and order-reversal flows.
- A report builder / CSV-Excel-PDF export (`Rapportages`, `boekhouder` role).

## Design reference

Visual tokens (color, radii, type) aren't restated here — read
`designs/Bar App.dc.html` directly when building a screen (it's inline
`style="..."` per element, easy to grep for the section you need). Key
constants worth knowing up front: accent `#ee5a24`, warm background `#faf7f3`,
Manrope typeface, 44–52px tap targets (bar tablet, used with busy/wet hands).

**`accent` vs. `accent-active` (settled, 2026-08-26)**: `accent.DEFAULT`
(`#ee5a24`, the prototype's literal accent color) only clears WCAG AA
contrast for dark text/icons on an accent background (5.19:1) — bold white
text under ~18px on that same background is 3.42:1, below the 4.5:1 AA
minimum. One background shade can't satisfy both, so `tailwind.config.ts`
keeps `accent.DEFAULT` for dark-text-on-accent uses (e.g. the "beheerder"
role badge) and adds `accent.active` (`#c9451a`, 4.83:1) for any bold
white/light text on an accent-filled control (buttons, active tab/chip
state, selection badges). Found during #7 (`BezettingOverlay.tsx`'s "Klaar"
button, the first real `check:a11y` run against a rendered button) and
applied to every `bg-accent` + white-text spot #8 added
(`DienstTabs.tsx`, `Assortiment.tsx`, `Mandje.tsx`, `AfrekenenOverlay.tsx`) —
see the comment on the `accent` token in `tailwind.config.ts` for the exact
contrast numbers. **Any future screen putting bold white/light text on an
accent-filled background should reach for `bg-accent-active`, not
`bg-accent`**, to stay green on `check:a11y` without rediscovering this.
