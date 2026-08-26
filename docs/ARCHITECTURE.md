# Architecture — ABAS

Living document — decisions land here first (see `CLAUDE.md` → Werkstraat).
`CLAUDE.md` stays the short, gate-complementing summary; this is where the
detail behind it lives.

## Bronmateriaal

The current design source is a Claude Design click-prototype (`dc-runtime`
templating, not portable code) exported into this repo:

- `README.md` — handoff notes from the design tool.
- `project/Bar App.dc.html` — the bar-facing app: Verkoop (sales), Dienst
  (shift), Leden (members), Assortiment (products), plus screens for roles
  and features not yet in scope here (see "Wat het prototype deed maar hier
  nog niet is besloten" below).
- `project/Lid App.dc.html` — the member-facing portal.
- `chats/*.md` (43 files) — the design conversations; useful for *why*, not
  binding on *what we build*. Index by topic:
  - Multi-person shifts / "wie geeft uit" at checkout: `chat18.md`, `chat19.md`
  - Permission model iteration (bardienst/barmanager/beheerder/boekhouder,
    PIN step-up): `chat21.md`, `chat25.md`, `chat26.md`, `chat35.md`, `chat42.md`
  - Activity types tied to a shift: `chat36.md`–`chat38.md`
  - Report builder / bookkeeper exports: `chat39.md`, `chat41.md`
  - Overall bar-vs-beheer flow rationale: `chat19.md`–`chat21.md`, `chat24.md`, `chat25.md`

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

**Open**:
- Exact shape of `useShell()`'s contract beyond the three named fields
  (`density`, `overlay`, `columns`) — what `overlay` and `columns` mean
  concretely for a real component is still to be pinned down by the first
  screen that needs it.

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
  tablet", never a specific person.

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

**Still open**:
- **Device account provisioning flow**: who creates the per-tablet Supabase
  Auth account and how (manual via Studio for the single Aurora tablet today;
  needs a real flow if a second tablet is ever added). Fine to leave manual
  for now given single-tenant, single-club scope.

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

- Een e-mailadres bij een lid is optioneel. Het invullen en opslaan van een
  (nieuw) e-mailadres is de trigger om via
  `supabase.auth.admin.inviteUserByEmail()` (server-side, secret key) een
  magic-link-invite te versturen waarmee het lid zelf een portal-account
  activeert. Dit gebeurt server-side vanuit `src/lib/supabase/server.ts` (of
  een route handler die dat bestand gebruikt) — nooit met de client-side
  sleutel, per de bestaande regel dat alleen die twee bestanden de Supabase
  SDK mogen importeren.
- Dit gebeurt automatisch **alleen** de allereerste keer dat een lid een
  e-mailadres krijgt. Wijzigt het e-mailadres van een lid dat al een account
  heeft, dan gebeurt er verder niets automatisch — geen nieuwe invite, geen
  wijziging aan het gekoppelde auth-account. Bewust simpel gehouden voor MVP.
- Een beheerder kan vanuit Ledenbeheer altijd handmatig een invite (opnieuw)
  laten versturen — voor een lid dat de eerste mail miste, én voor
  bestaande/geseede leden die nog nooit een invite kregen. Er is geen
  automatische bulk-uitnodiging met terugwerkende kracht nodig: die leden
  mogen later alsnog een link krijgen, pas op het moment dat de beheerder dat
  triggert.
- Koppeling `members`-rij ↔ `auth.users`-rij via een nullable veld (bv.
  `members.auth_user_id`) — nullable omdat een lid zonder e-mail nooit een
  account krijgt.

Implementatie-acceptatiecriteria: zie GitHub issue #24.

## Wat het prototype deed maar hier nog niet is besloten

Listed for reference only — none of this is scoped in or out yet. Don't build
any of it without a `docs/features/<naam>.md` spec:

- Activity types linked to a shift ("Training" / "Wedstrijddag" / …).
- A dedicated audit-log screen (`Logboek`) — the ledger/transaction table
  itself will exist regardless (it's the money trail), just not a filterable
  UI for it yet.
- Balance corrections and order-reversal flows.
- A report builder / CSV-Excel-PDF export (`Rapportages`, `boekhouder` role).
- Alternate login methods for the bar shell beyond PIN (prototype explored
  password + magic-link fallbacks) — `CLAUDE.md`'s Auth section only commits
  to PIN for bar/beheer and email (magic link/password) for the portal.
- Product/member admin screens (`Leden`, `Assortiment` CRUD) — implied
  necessary since `beheerder` manages prijzen/ledenbeheer per `CLAUDE.md`, but
  not yet specced.

## Design reference

Visual tokens (color, radii, type) aren't restated here — read
`project/Bar App.dc.html` directly when building a screen (it's inline
`style="..."` per element, easy to grep for the section you need). Key
constants worth knowing up front: accent `#ee5a24`, warm background `#faf7f3`,
Manrope typeface, 44–52px tap targets (bar tablet, used with busy/wet hands).
