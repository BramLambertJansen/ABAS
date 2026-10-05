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

- `shells/bar` — tablet/desktop only, no phone fallback. That is a support
  statement, not a boundary the app enforces: since ADR 0016 any bardienst
  can log in on any device (`dienst-per-sessie.md` → vraag 20).
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
has ever set, `barCapabilities.overlay`). Until #17 it fell through to the
same markup for `"sheet"` rather than building an untested second branch.
**The real `"sheet"` branch is built and merged (#17, PR #110,
2026-09-28)**, with the portal-profiel sheets as its first consumer
(`docs/features/portal-profiel.md` → useShell()-contract): anchored to the
bottom, full width, rounded top corners (`rounded-t-[28px]`), `bg-canvas`,
backdrop `bg-ink/40`, and a slide-in (`animate-sheet-in` in
`tailwind.config.ts`) that only runs under `motion-safe:`. No drag-to-close
gesture (WCAG 2.5.1). Both variants share one code path for everything
below; only layout/position differ. The modal dialog is white, as every dialog in `designs/Bar App.dc.html`
(it was a dark `rail-card` panel until 2026-09-24); content inside uses the
light tokens, and `InitialsAvatar`/`RoleBadge`/`MemberPill` take a
`tone="light"` there. Required regardless of variant: `role="dialog"`, `aria-modal`,
labelled by title, focus-trap, focus in/out on mount/unmount, Escape and
backdrop-click both close. Reused as-is (no new decision) by issue #8's
sale-checkout confirmation — see `docs/features/verkoop.md`. `density`
(`"comfortable" | "compact"`) still has no real consumer as of #8 either;
leave that one open until a screen actually needs to branch on it, same
"don't build ahead of a second real case" reasoning the `"sheet"` branch
followed until #17.

**Overlay presence (settled, 2026-09-28, built 2026-09-29 in PR #108, ADR
[0014](adr/0014-overlay-aanwezigheid-via-gedeelde-context.md))**: every
`Overlay` registers itself on mount/unmount with a counter in
`src/components/OverlayPresence.tsx`, in a layout effect so the count is
current before any consumer's passive effect reads it. `useOpenOverlayCount()`
reads it; with no `OverlayPresenceProvider` above, registering is a no-op and
the count is 0.
The only provider sits in `DienstTabs`, for the "dienst staat nog open"-melding
(`docs/features/dienst-te-lang-open.md`), which waits until no other overlay
is open instead of stacking on top — two `Overlay`s at once fight over
Escape/backdrop/focus-trap. A dialog built outside `Overlay` isn't counted.

**Dialogs, tabs and landmarks (built and merged, #125, PR #139, 2026-10-02;
`docs/features/dialogen-tabs-landmarks.md`)**: no ADR, ADR 0014 stands.
- `Overlay` now keeps Tab/Shift+Tab inside the dialog (computed over the
  currently tabbable elements, plus a `focusin` backstop) and shields the
  background through `src/components/overlayShield.ts`: `inert` on the
  siblings of the overlay's ancestor chain (no portal), document scroll lock,
  and the element to return focus to. One shared counter, release deferred by
  a `setTimeout 0`, so a sequence A → B (Lid beheren → Bestellingen →
  Terugdraaien) neither reopens the background nor loses the original trigger.
  Stacking stays forbidden (ADR 0014). Consequence: anything in a sibling of
  the overlay branch (rail, notifications) is not operable while a dialog is
  open. A variant may change layout, never these rules.
- **`closeBlocked` / `closeBlockedMessage`** are the shared close contract:
  while `closeBlocked` is true, Escape and backdrop do nothing but show the
  `role="status"` message (after an attempt) and the dialog gets `aria-busy`.
  The consumer keeps its own close buttons `disabled`. Applied as
  `closeBlocked={pending}` on the seven money/confirm overlays (Afrekenen,
  Opwaarderen, Dienst afsluiten, Overnemen, Afmelden, Lid-bestellingen,
  Terugdraaien). A control that becomes disabled during `closeBlocked` sends
  focus to the dialog container. Optional `returnFocusFallback` exists, no
  consumer passes it yet; the fallback chain is trigger, that ref, the active
  `role="tabpanel"`, `main`.
- **`Tabs`** (`src/components/Tabs.tsx`: `TabList`, `TabPanel`) is the single
  tablist implementation for `PortalDashboard`, `BeheerTabs` and `DienstTabs`:
  roving tabindex, `orientation` (rail = vertical), `activation` (manual for
  portal and beheer, automatic for the rail), wrap-around, `aria-controls` only
  on the selected tab (panels still mount only while active). Key logic is the
  pure `nextTabIndex` in `src/lib/tabKeys.ts` (unit-tested). A `TabPanel`
  without focusable content is itself a tab stop. Shells only pass classes.
- **Landmarks:** `DienstTabs` renders `nav` ("Bar") then one `main` that wraps
  the `tabpanel`; `DienstTeLangOpenMelding` and `AdminMeldingen` sit inside that
  `main` as siblings of the panel. Portal and beheer keep their `main` + `header`.
- **`ZijPaneel`** (`src/components/ZijPaneel.tsx`, tablet-bruikbaarheid, #124,
  PR #145) is the right-hand side panel of the bar, shared by `Mandje` (Verkoop)
  and `DienstActief` (Dienst): `w-[clamp(300px,36vw,372px)]`, scrolls inside
  itself, `as` is `div` or `aside`. Bar layout on tablets (768px portrait,
  1024px landscape supported, no device notice): the layout follows available
  width rather than per-screen breakpoints. The product grid in `Assortiment`
  is `repeat(auto-fill, minmax(150px, 1fr))` and no longer reads
  `useShell().columns` (still used by `StaffPicker`); the `DienstTabs` rail is
  80px, 92px from a 1024px viewport; the `BeheerTabs` header wraps
  (`flex-wrap`) so Uitloggen stays visible. A basket line is a two-row grid
  (name, then stepper and line total) so the full name stays readable in the
  300px panel. Deliberately no `@tailwindcss/container-queries`. Covered by
  `e2e/tablet-bruikbaarheid.spec.ts`; no physical-tablet check yet.
- Not built: a `check:policy` rule against `role="dialog"`/`role="tablist"`
  outside these components (Bram's decision, open); pending E2E for the four
  overlays other than Afrekenen/Terugdraaien (#140); the manual Safari/iPadOS/
  touch/screen-reader run. Nothing here claims behaviour on those or WCAG
  conformance.

**Opslaan, sluiten en gelijktijdige acties (built and merged, #126, PR #142,
2026-10-02; `docs/features/opslaan-sluiten-pending.md`)**: no ADR, ADR 0014
stands. Shared pieces, all additive to the T05 contract:
- `src/lib/opslaan.ts`: pure rules and texts (`PENDING_TIMEOUT_MS` = 30 s,
  per-object serialisation helpers, the "unsaved" definitions, the discard and
  unknown-outcome texts). Unit-tested.
- `src/hooks/useOpslaanBlokkade.ts`: `useOpslaanBlokkade(pending, { metTimeout })`
  returns `closeBlocked` and `timedOut`. Admin dialogs without money keep the
  default 30 s time-out (the block drops, outcome "unknown"); money overlays
  (Afrekenen, Opwaarderen, Nieuw lid) pass `{ metTimeout: false }`: no
  time-out, blocked until the request settles.
- `src/hooks/useHerstelFocus.ts`: restores focus to the result section after a
  pending action (never `body`).
- `src/components/OpslaanSectie.tsx`: one action section (aria-busy, the
  "wait for the running change" hint, its own `role="alert"` error, so one
  action's error does not displace another's).
- `src/components/OnbekendeUitkomstMelding.tsx`: unknown outcome of a money
  request: check text, "Ik heb gecontroleerd" (disabled while `hangend`), no
  automatic retry. Discourages a blind retry, does not prove an outcome:
  there is no idempotency key; backend idempotency is issue
  [#143](https://github.com/BramLambertJansen/ABAS/issues/143).
- `Overlay` prop **`onopgeslagen`**: Escape and backdrop ask for confirmation
  inline in the same dialog (no second overlay, ADR 0014); the consumer's own
  Sluiten/Annuleren buttons discard directly; `closeBlocked` always wins.
Consequence: a truly hanging money request keeps its dialog blocked until
reload. Not covered: `TweestapSheet`, manual Safari/touch/screen-reader run.

**Invoerfeedback, ledenzoeker en productfilters (built and merged, #127, PR #152,
`3a8d13e`; `docs/features/invoerfeedback-zoeken-filters.md`)**: no ADR, no
database, RPC or policy change. Shared pieces:
- `src/lib/veldFouten.ts`: classification (`bedragFout`, `emailFout`) plus the
  user-facing texts for all forms (`bedragFoutTekst`, `EMAIL_ONGELDIG_TEKST`;
  these live here, not in `messages.ts`). The value stays with
  `parseEuroToCents`; no amount is computed here.
- `src/hooks/useVeldMoment.ts`: only tracks the touched/attempted/alert flags.
  It does not decide visibility: each consumer combines the flags with its own
  classification (the immediate `tehoog` rule exists only in
  `OpwaarderenOverlay`; recovery follows from recomputing the classification).
- `src/components/TekstVeld.tsx`: additive `fout`/`foutAlert`/`hint` props;
  `TekstVeld` wires `aria-invalid`/`aria-describedby` itself. The exported
  `VeldFout` only renders the message and sets `role="alert"` when its `alert`
  argument is true; custom-styled inputs must wire the aria attributes
  themselves. Primary buttons are no longer `disabled` on an invalid amount or
  e-mail; the attempt shows the error.
- `src/components/LidZoeker.tsx`: the member search as a combobox; its keys live
  in `LidZoeker.handleKeyDown`.
- `src/hooks/useListbox.ts`: shared state and DOM behaviour only (ids,
  open/active state, outside click, scroll into view) for `LidZoeker` and
  `Select.tsx`. No keyboard logic: keys stay in `LidZoeker.handleKeyDown` and
  `Select.handleKeyDown`.
- `src/features/verkoop/productFilter.ts` (`filterProducten`): filtering by
  search term/category only. The result line and the D3 category-click
  behaviour live in `Assortiment`; `zoekResultaatTekst` in
  `src/features/verkoop/messages.ts`.
- `lidwisselWistMandje` in `src/features/verkoop/cart.ts`: a pure predicate
  shared by `VerkoopScherm.chooseMember` (which clears the cart) and `Mandje`
  (which shows the inline confirmation first): a member switch clears a filled
  cart only for another member.

**First multi-screen bar navigation (settled, 2026-08-26)**: issue #8 is the
first time `shells/bar` needed more than one screen behind an open shift.
`src/features/verkoop/DienstTabs.tsx` renders the navigation (Verkoop,
default/active; Dienst, the existing #7 `DienstActief` content). Originally
a plain top tab bar; since 2026-09-24 it follows the prototype's dark
92px icon-rail (Bram: "zet zoveel mogelijk recht" na een ontwerp-vs-code-
vergelijking) — still a `role="tablist"` (now `aria-orientation="vertical"`, via the shared `TabList`),
so the navigation contract from `docs/features/verkoop.md` → Navigatie is
unchanged, only the pixels. `DienstStarten.tsx` hands off to `DienstTabs`
entirely once a shift is open, rather than branching inside its own dark
PIN-entry layout. Each tab's content is mounted/unmounted as the active tab
changes (not hidden via CSS) — same lifecycle-based approach as
`Overlay.tsx` — so returning to a tab always re-fetches fresh data instead of
showing a stale snapshot. T03 / #43 (PR #148) lifts only the sale draft into
`DienstTabs` via `useVerkoopDraft`: member selection and its comparison id,
cart quantities, last-known display information and search/view state survive
tab switches. Queries and dialogs stay in the active screen. `BarApp` keys
`DienstTabs` by session and shift; closing the shift, changing session or a
successful checkout clears cart and member (the member search term stays, by decision). No browser persistence is used. `useMandjeMelding` also lives in `DienstTabs`.
Checkout waits (`ready`, in both `confirmDisabled` and `handleConfirm` of `AfrekenenOverlay`) for current products, member balance, settings and crew; missing
members/products block confirmation with a message, while cached product
names keep archived lines removable. Open overlays make the rail `inert` (`overlayShield`, T05), so a pending
financial mutation cannot be unmounted by a rail click; there is no separate
disabled state on the rail. No RPC, schema or policy changes.

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
- Since ADR 0016 (A4), `top_up` refuses a top-up to the member of the calling
  bar session (`self_top_up_forbidden`), and every bar money RPC requires a
  registered bar session linked to the shift; `bar_session_id` on the booking
  is filled by the RPC itself, never by the client.

**RPC-grens gold niet voor sessieloze aanroepers (opgelost, 2026-09-22)**:
gevonden bij het bijwerken van de gehoste omgeving. Postgres geeft bij
`create function` standaard `EXECUTE` aan `PUBLIC`, en Supabase's
platform-brede default privileges geven daarnaast een expliciete grant aan
`anon`. Geen enkele migratie had een van beide ooit ingetrokken, dus de
`grant execute ... to authenticated` in `0001_init.sql` en later *las* als
de poort maar wás het niet: **elke RPC was aanroepbaar met alleen de
publishable key, zonder sessie**. Voor `place_order`/`top_up` betekende dat
concreet dat iedereen tijdens een open dienst saldo kon afschrijven of
bijschrijven; `start_shift` was zonder account brute-forcebaar, wat de
"geen lockout in de MVP"-afweging hieronder ondergroef (die ging uit van
een ingelogde aanroeper). De beheerder-RPC's waren niet kwetsbaar — hun
ADR-0002-actorcheck geeft `actor_not_found` zonder `auth.uid()`.
Empirisch bevestigd door de aanval lokaal uit te voeren: als `anon`, met
`auth.uid()` op null, een bestelling geboekt én saldo bijgeschreven.
Dichtgezet in `0018_rpc_execute_alleen_authenticated.sql` (intrekking voor
alle bestaande functies plus `alter default privileges` voor nieuwe), met
`supabase/tests/rpc_execute_grants.test.sql` als blijvende bewaking — die
toetst de invariant over *élke* functie in `public`, niet over een
handgetypte lijst. Die test vult meteen een blinde vlek in de suite: elke
andere test draait als `authenticated`, dus niemand keek ooit naar wat een
sessieloze aanroeper mag.

**Leestoegang per rol (settled, 2026-09-21)**: ADR
[0007](adr/0007-rol-lid-leest-alleen-eigen-rijen.md) — the blanket
`for select to authenticated using (true)` from `0001_init.sql` now only
applies to bar/beheer sessions (and, until ADR 0016, the shared device
session). A session that
resolves to a `members` row with role `lid` sees only its own rows in
`members`/`orders`/`order_lines`/`top_ups`
(`0015_lid_leest_alleen_eigen_rijen.sql`); `shifts`/`shift_members`/
`products`/`app_settings` stay readable for everyone, deliberately. Strictly
narrowing: no existing session type changed behaviour, which
`supabase/tests/rls_lid_eigen_rijen.test.sql` asserts explicitly rather than
assumes. Read access is not tied to an active bar session: ADR 0016 left
these RLS policies unchanged (`dienst-per-sessie.md` → Expliciet buiten
scope).

**Settled (2026-08-24)**:
- **Single organization.** ABAS is for Aurora only — no `org_id`, no
  multi-tenant scoping. RLS policies are written against a single club's
  data. (Revisit as a real architecture change, with an ADR, if ABAS is ever
  meant to serve more than one vereniging — don't creep towards multi-tenant
  incidentally.)
- **Persoonlijke bar-sessies (settled 2026-09-29, ADR
  [0016](adr/0016-dienst-hoort-bij-geregistreerde-app-sessies.md); vervangt
  het gedeelde device-account van 2026-08-24)**: elk apparaat heeft een eigen,
  persoonlijke Supabase-sessie van een bardienst of beheerder, geregistreerd in
  `bar_sessions` (sleutel: het JWT-claim `session_id`, modus `bar` of `beheer`,
  `last_activity_at`). Een dienst hoort bij die sessie via `shift_sessions`;
  elke bar-RPC met een `p_shift_id` eist een actieve, niet-inactieve sessie in
  modus `bar` mét een actieve koppeling aan die dienst (`require_shift_session`,
  `0028`), elke beheer-RPC een sessie in modus `beheer` met aal2
  (`require_beheer_session`, ADR 0017). Uitzondering, bewust: de
  beheerdersingrepen `admin_end_shift`, `admin_take_over_shift` en
  `admin_end_bar_session` controleren alleen de rol beheerder en werken ook
  vanuit een bar-sessie zonder aal2 (`require_session(['bar','beheer'])` of
  `require_bar_session()`; ADR 0017, besloten 8 in `beheer-tweede-factor.md`). Het einde van een sessie (uitloggen,
  60 minuten inactiviteit, afmelden door een beheerder, rolwijziging,
  promotie naar beheerder) is een database-feit: de RPC's weigeren meteen,
  ook als het access token nog geldig is, en de bijbehorende rij in
  `auth.sessions` wordt verwijderd, zodat het token ook niet meer kan
  verversen (ADR 0017). Individuele attributie komt nog steeds uit de bezetting
  (`served_by`), niet uit de sessie: `bar_sessions.member_id` betekent
  "ingelogd als", nooit "deed dit". Spec: `docs/features/dienst-per-sessie.md`.
  Het device-account, `/koppel`, `BAR_DEVICE_SECRET` en de device sign-in in
  de middleware zijn verwijderd; beheer-writes gebeuren in een sessie in modus
  `beheer` (zie "Beheer-sessie" hieronder).

**Beheer-sessie (settled, 2026-08-26)**: ADR
[0002](adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md) — Bram
corrected the assumption behind the shared device-session model (since
replaced, ADR 0016, see above): a `beheerder` identity is not shared. A
beheerder-only write (issue #14 Assortimentbeheer, later ledenbeheer) requires
the beheerder to sign in with their own e-mail (magic link/wachtwoord, same
mechanism as portal-login) on a dedicated route within `shells/bar` (e.g.
`/beheer`). Because this repo's session storage (`@supabase/ssr`,
cookie-based) holds exactly one active session per browser, a login **replaces**
the session in that browser until an explicit sign-out — not a second,
concurrently-active session. Since ADR 0016, beheer is a session in modus
`beheer`: the choice "Beheer" in `ModusKeuze` calls `register_bar_session`, a
session never changes modus, and every beheer RPC checks the mode server-side
(`require_beheer_session`) before the actor check below. Since ADR
[0017](adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md) a beheer
session also needs a second factor: TOTP, set up in the portal (beheerders
only), and `register_bar_session('beheer')`/`require_beheer_session` demand
`aal = 'aal2'` (`mfa_not_enrolled`, `aal2_required`). A lost factor is reset
by Bram in the Supabase dashboard; the app has no function for it. Beheerder-only RPCs (`create_product`, `update_product_price`,
`set_product_archived`, …) verify the caller via `auth.uid()` →
`members.auth_user_id` → role `beheerder`, replacing the
`p_actor_member_id`/`p_actor_pin`-per-call pattern ADR 0001 introduced (ADR
0001 is superseded, kept for the earlier reasoning). Partially addresses
issue #22 ("alternate bar-shell login methods") — this is an alternate
login, but scoped to beheer actions only; #22 itself is about the bar-shell
PIN flow (#6), which this doesn't touch. See "Auth-methode & modus" below
(ADR 0003) for the corrected scope.

**Auth-maillinks (settled, 2026-09-23)**: ADR
[0008](adr/0008-auth-maillinks-via-token-hash.md) — every Supabase mail that
yields a session links to an app route with `?token_hash=...&type=...`,
redeemed with `verifyOtp()`, instead of relying on the PKCE `?code=` flow,
whose `code_verifier` cookie only exists in the browser that requested the
link. Requested on the tablet or pc, opened on a phone is the normal case
here. The mail templates live in the Supabase dashboard, not in this repo.
First applied to `/beheer/callback` (magic link) and
`docs/features/wachtwoord-vergeten.md`. Implemented in PR #69 (merged
2026-09-23): `/beheer/callback` accepts `type` = `email`/`magiclink`/`invite`
next to the old `?code=`, and deliberately rejects `signup`/`email_change`/
`recovery` (`test/beheerCallback.test.ts`); `recovery` is only redeemed by
`/beheer/wachtwoord-herstellen`, on submit. The same PR added shared
building blocks for the auth screens: `src/components/AuroraMerk.tsx`
(logo/heading block, also used by `ModusKeuze` and `DienstStarten`),
`src/components/NieuwWachtwoordVelden.tsx` + `src/lib/passwordPolicy.ts`
(for reuse by #15/#17), and `src/lib/authErrors.ts` (rate-limit
recognition and message — since PR #75 also used for the invite error in
`LidBeherenOverlay`).

**Settled (2026-08-26)**: this mechanism depends on `members.auth_user_id`
(planned in "Lid-accounts" below, issue #24) and an e-mail login flow
(issue #15) — neither exists in the codebase yet as of this writing.
Whether #14 builds a minimal slice of that itself or waits for #15/#24 to
land first was an open sequencing question — **decided: #14 builds it
itself, minimally** (just the `/beheer` login form + the `auth_user_id`
column + manual provisioning of beheerder Supabase Auth accounts, same
manual pattern as the device account of that time, removed since ADR 0016),
not the full portal login flow
(#15) or the self-service invite flow (#24 → "Lid-accounts" below). See ADR
[0003](adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) and
`docs/features/assortimentbeheer.md`.

**Vervallen door ADR 0016 (2026-09-29): device sign-in, tablet-trust en de
device cookie.** De middleware-inlogstap voor het gedeelde device-account
(issue #32, `SUPABASE_DEVICE_EMAIL`/`SUPABASE_DEVICE_PASSWORD`), het geaccepteerde
risico dat elke bezoeker van de bar-URL zo werd ingelogd (issue #34, daarna
`/koppel` met ADR 0011) en het uitgestelde punt over de cookie-afbakening t.o.v.
`shells/portal` bestaan niet meer: `src/middleware.ts` logt niemand meer in, en
verwijdert bij de eerste request het oude `abas_tablet`-cookie. Wie op de bar
werkt logt persoonlijk in vanaf de namenlijst (of via `/beheer`); de openbare
URL toont zonder sessie alleen die namenlijst en het inlogscherm. De middleware
houdt de `/design`-gate en de gewone cookieverversing (`getSession()`). Zie de
git-geschiedenis en ADR 0011 voor de oude mechanismen.

**PIN storage/hashing (settled, 2026-08-26)**: confirmed by Bram (issue
[#3](https://github.com/BramLambertJansen/ABAS/issues/3)) — the assumption
below was already what `0001_init.sql` implemented, this makes it a decision
instead of an assumption.
- PINs are hashed via `pgcrypto`'s `crypt()`/`gen_salt('bf', 12)` in
  `members.pin_hash` (cost 12 since ADR 0016; existing hashes are rehashed on
  the next successful PIN login), never stored or compared in plaintext.
  `verify_bar_pin` (service_role only) checks `crypt(p_pin, pin_hash) =
  pin_hash` at login — the client only ever sends the entered PIN. `start_shift`
  no longer takes a PIN: the login is the authentication of the starter.
- Format: 4 digits, matching the prototype's numpad demo (`DEMO_PIN =
  '1234'`). Enforced by the numpad UI (issue #6) restricting entry to 4
  digits, not by a schema constraint on `pin_hash` — the column stores a
  hash, not the PIN itself, so there's nothing shaped like "4 digits" left
  to constrain there. A wrong-length attempt just fails `crypt()` comparison
  like any other wrong PIN.
- Lockout per member (ADR 0016, replaces "no lockout in MVP"): after 5 wrong
  PIN attempts the PIN is blocked on all devices (`pin_failures`); a successful
  password login lifts it, and wrong passwords don't count (the name list is
  public, anyone could otherwise lock out anyone). The PIN only works on a
  device where the member logged in with the password before
  (`bar_devices`/`bar_device_members`, the `abas_apparaat` cookie, 30 days,
  per member per device: only a login of that member on that device extends
  it, `0033`; "afmelden" revokes the device, archiving/role `lid`/promotion to
  beheerder revokes the member on all devices). A beheerder without a verified
  second factor can't log in with the PIN (`pin_needs_mfa`, ADR 0017).
  Wrong PINs are also limited per IP (`pin_ip`, see `login_throttle` below).
- Negative-test coverage: `supabase/tests/verify_bar_pin.test.sql`.

**Local/CI seed accounts (settled, 2026-08-26; herzien 2026-09-29)**:
`supabase/seed.sql` inserts fixed `auth.users`/`auth.identities` rows purely so
`supabase start` in CI/local dev has accounts to sign in as. Until ADR 0016
that included a shared device account (`device@aurora.local`); it is gone. Every
seed bardienst/beheerder now has an e-mail/wachtwoord account (local-only
passwords), and every e2e flow logs in from the name list
(`e2e/helpers/barLogin.ts`). Production is unaffected: `seed.sql` only runs on
local `supabase start`/`db reset`, never against a remote/production project.
CI exports `SUPABASE_SECRET_KEY` (the local `service_role` key) for the
server-side bar login.

Password login through the local GoTrue also required flipping
`supabase/config.toml`'s `[auth]`/`[auth.email]` `enable_signup` from
`false` to `true` — a known GoTrue quirk (`supabase/auth#330`, still open):
`enable_signup = false` doesn't just block *new* signups, it disables the
email provider's login path too (`signInWithPassword` failed with "Email
logins are disabled" even for a pre-existing, directly-inserted account).
`config.toml` only governs the local `supabase start` stack (nothing in this
repo runs `supabase config push` against the hosted project), so this has no
effect on production's real signup policy.
**Flag for #15 (portal-login)**: if the hosted project's dashboard ever
sets its own signup toggle to closed, password login may silently break
for existing members too by the same GoTrue behavior — worth confirming
against the real project before shipping password login there.

**e2e-mocks on `/beheer` (herschreven 2026-09-29)**: er is geen device-sessie
meer die `/beheer` al voor de login inlogt, dus specs die Supabase via
`page.route()` mocken zien alleen de sessie die de spec zelf maakt. Sinds ADR
0016 moet zo'n spec wel de bar-sessie-RPC's mocken (`mockBarSessie` in
`e2e/helpers/supabaseMock.ts`: `my_bar_state`, `register_bar_session`,
`touch_bar_session`, `end_bar_session`), omdat de keuze "Beheer" de sessie
server-side registreert. Een `members`-mock hoort nog steeds alleen een rij voor
de `auth_user_id` van de gemockte beheerder terug te geven (zie `mockBeheerder`
in `e2e/ledenbeheer-invite.spec.ts`). Issue #78 (zou `/beheer` de "niet
gekoppeld aan een lid"-melding aan de device-sessie moeten tonen) vervalt.

## Auth-methode & modus (bar vs. beheer) (settled 2026-08-26, amended 2026-09-02, built 2026-09-20)

ADR [0003](adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)
generalizes the "beheer-sessie" mechanism above: e-mail/wachtwoord login
isn't a beheer-specific concept. ADR
[0005](adr/0005-wachtwoord-verplicht-pin-optionele-snelkoppeling.md)
amends ADR 0003 → Beslissing 1: a `bardienst`/`beheerder` member **always
has e-mail/wachtwoord** (a linked Supabase Auth account,
`members.auth_user_id`); a PIN is an optional shortcut on top of it, never a
replacement. Both at once is the normal state for a member with a PIN; the
only forbidden state is PIN-only. The member toggles the PIN themselves via
`set_own_pin`, only in the portal (`usePortalSetOwnPin`); "Mijn account" no
longer exists in the bar shell (ADR 0016). "Has a PIN" is
the generated column `has_pin` (`pin_hash is not null`, readable while
`pin_hash` itself is column-REVOKEd — `0010`); no separate auth-method
column.

After an e-mail login the signed-in person picks a **mode: bar or beheer**
(`ModusKeuze.tsx`) — modes are separate instances, not something you switch
inside one session; changing mode means signing out and back in (a
generalization of the single-session-per-browser replace-not-coexist
mechanism above, not a new mechanism).

Bar-modus itself, however signed into, stays exactly what already exists:
`add_shift_member`/`remove_shift_member` (issue #7) and `served_by`-attribution
at checkout are unchanged; `start_shift` takes no PIN anymore. **Both routes
into bar-modus** (issue #42, PR #60; herzien door ADR 0016): the name list on
the start screen (PIN on a trusted device, or wachtwoord; the list shows every
bardienst member, PIN or not, and you never type an e-mail address), and
e-mail/wachtwoord on `/beheer` → "Bar" in the mode chooser
(`register_bar_session('bar')`). The start screen links to `/beheer`
("Inloggen met e-mail"). A PIN login always registers mode `bar`, so that
session never gives beheer; since ADR 0017 the rule for the *account* is: a
PIN login never gives beheer **without a second factor** (restrisico K1,
accepted 2026-10-01). Spec: `docs/features/auth-methode-per-lid.md`,
`docs/features/dienst-per-sessie.md`.

This also revises `docs/features/dienst-starten.md` → "Expliciet buiten
scope"'s claim that the prototype's bar/beheer modus-keuze "vervalt" — that
held under the assumption (since corrected by ADR 0002) that there'd never
be a separate beheer session. The mode concept is real again at the
architecture level; #6's screens themselves are unaffected, see ADR 0003.

**Accountbestaan is niet geheim op de Auth-API** (ADR
[0013](adr/0013-accountbestaan-niet-geheim-op-auth-api.md), accepted
2026-09-28, #70). With the public anon-key anyone can tell whether an e-mail
address has an account (`/auth/v1/otp` with `create_user: false`,
`/auth/v1/recover` timing/429). The app only guarantees that its own UI never
says so: every mail-sending auth form shows the same neutral message. UI
masking is not a fix for enumeration; don't present it as one.

## Dienst & bezetting (settled, 2026-08-24)

Revives the prototype's "crew"/"wie werkt er mee" concept (`chat18.md`,
`chat19.md`), simplified: no per-order PIN, no "wie geeft uit" hard-block
(see open item below on whether the select is required or defaults).

- Starting a shift (`dienst`) happens in the starter's own bar session: the
  login on the name list (PIN on a trusted device, or wachtwoord) is the
  authentication, and the shift belongs to that session (ADR 0016). No second
  PIN at the start.
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
toenmalige device-account (sinds ADR 0016 verwijderd), **handmatig geprovisioned** (Supabase
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
`role="tablist"`-/mount-per-tab-patroon als `DienstTabs.tsx` (sinds #125 beide via het gedeelde `TabList`; zie "First
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

**Bestelling terugdraaien (2026-09-24)**: `0020_bestelling_terugdraaien.sql`
voegt de geldtabel `order_reversals` toe (alleen toevoegen, primary key
`order_id` = hooguit één keer) en twee RPC's die `orders.total_cents`
terugboeken: `reverse_order_at_bar` (destijds de gedeelde bar-sessie; sinds
ADR 0016 een bar-sessie die aan de dienst gekoppeld is, open dienst, wie het
deed uit de bezetting — het `served_by`-patroon) en `reverse_order_as_admin`
(beheerder via `auth.uid()`, ADR 0002, sinds ADR 0016/0017 in een
beheersessie met aal2, elke bestelling). Geen nieuwe ADR: beide wegen volgen een bestaand patroon.
Teruggedraaide bestellingen tellen niet mee als omzet (`useShiftSummary`,
`ledger.ts`). Zie `docs/features/bestelling-terugdraaien.md`.

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
de dienst-starter. *(Sinds ADR 0016: elke sessie die aan de dienst gekoppeld
is; een beheerder op een ander apparaat sluit af met `admin_end_shift`.)* De overlay is gebouwd tegen de gedeelde `StatCard`
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

**Activiteittypes per dienst (gebouwd en gemerged, #18, 2026-09-22, [PR #65](https://github.com/BramLambertJansen/ABAS/pull/65))**: een door de beheerder beheerbare
`activity_types`-tabel (`docs/features/activiteittypes.md`,
`supabase/migrations/0019_activiteittypes.sql`), 1-op-1 het
`products`-patroon (archiveren, nooit verwijderen) zonder
`category`/`price_cents`. Een dienst kiest, verplicht, bij het starten één
activiteittype — `start_shift` kreeg er een derde, verplichte parameter bij
(`p_activity_type_id`), zichtbaar op het dienst-actief-scherm naast "Gestart
door X om HH:MM". Nieuwe "Activiteitstypes"-kaart naast
`NegatieveLimietInstellingen` in `/beheer`'s Instellingen-tab, drie nieuwe
beheerder-only RPC's in ADR-0002-vorm (`create_activity_type`,
`update_activity_type_name`, `set_activity_type_archived`). Dit is de
eerste migratie die `0018`'s `revoke execute ... from public/anon`-regel
(CLAUDE.md → Architectuurbeslissingen) zelf moest toepassen op nieuw
toegevoegde functies, inclusief op een herschapen `start_shift` (de
parameterlijst wijzigde, dus Postgres behandelt dat als een nieuw
functie-object met een eigen, opnieuw in te trekken default-`EXECUTE`) —
zie `docs/features/activiteittypes.md`'s "(bouw)"-aantekeningen voor de
volledige uitleg, inclusief een gecorrigeerde `search_path` (moest
`extensions` bevatten voor `crypt()`, zelfde bugklasse als
`0002_fix_start_shift_pgcrypto_search_path.sql`). Rapportage/filtering per
activiteittype bleef een los, nog niet gespecificeerd ticket — dit ticket
levert alleen de datalaag. (Het Logboek-scherm, #19, is inmiddels gebouwd
zonder activiteittype-koppeling; zie "Wat het prototype deed…".)

**Foutlogging (gebouwd en gemerged, #94, PR #98, 2026-09-28)**: ADR
[0015](adr/0015-client-fouten-via-rpc-zonder-actor.md),
`docs/features/foutlogging.md`. Onverwachte fouten uit `src/hooks/queries/`
gaan via `reportClientError()` (`src/lib/clientErrors.ts`) naar de tabel
`client_errors` (`0025_client_errors.sql`): alleen hook, `kind`/`code` uit
`classifyLoadError`, gesaneerd pad, telling en build-SHA; geen actor, geen
`message`. De hook geeft zijn eigen client (of de factory) mee, dus
`src/lib/` importeert geen Supabase-client. Dedupe per (hook, kind, code)
in geheugen, venster 5 minuten; fire-and-forget, gooit nooit. Schrijven
alleen via `log_client_error()` (`security definer`, alleen
`authenticated`, ook een lid, geen `anon`); de tabel heeft RLS aan, geen
policies, alles ingetrokken. Lezen alleen in Supabase Studio.
Pre-sessie-hooks en `signOut`-takken gebruiken `logLocalError()` (alleen
console). Retentie 90 dagen via `purge_client_errors()` en pg_cron-job
`purge_client_errors` (dagelijks 03:00 UTC), het eerste gebruik van
pg_cron; op het gehoste project nog niet aangetoond. `check:policy` weert
kale `console.error(` in `src/hooks/queries/`.

**Portal-profiel (gebouwd en gemerged, #17, PR #110, 2026-09-28)**: ADR
[0012](adr/0012-portal-eigen-data-voor-elke-rol.md),
`docs/features/portal-profiel.md`. De portal laat elke rol met een
gekoppelde `members`-rij binnen, niet meer alleen `lid`. `denied` blijft
alleen voor een sessie zonder gekoppeld lid. De portal toont voor elke rol
alleen eigen data: portal-leeshooks filteren expliciet op de eigen rij of
gaan via een zelf-scopende RPC. Dat is reviewwerk, geen gate. Nieuw
tabblad "Account" in `PortalDashboard.tsx`
(`src/features/portal-profiel/`, toegevoegd aan `PORTAL_ONLY_DIRS` in
`check:arch`) met naam, wachtwoord en, alleen voor bardienst/beheerder, de
eigen bar-PIN. Eén nieuwe migratie, alleen een functie:
`0026_eigen_naam_wijzigen.sql` met `update_own_name(p_name)`. Die is
zelfbediening zonder doel-id, net als `set_own_pin` (0014, ongewijzigd
hergebruikt), heeft geen rolcheck, scrubt `pin_hash` in de return en is
alleen uitvoerbaar voor `authenticated`. Wachtwoord wijzigen is
`auth.updateUser`, geen RPC. Nieuw gedeeld in `src/components/`:
`PinToetsenbord.tsx` (puntjes plus toetsenraster, `tone` `rail`/`light`,
getild uit `PinPad.tsx`, dat nu een dunne schil is) en een `tone`-prop
(`rail`, de standaard, of `light`) op `TekstVeld.tsx`. Nieuw gedeeld in
`src/lib/`: `ownPinErrors.ts` (PIN-foutcodes, -teksten en `PIN_PATTERN`;
sinds ADR 0016 alleen nog door de portal gebruikt, "Mijn account" op `/beheer`
is weg) en, in
`authErrors.ts`, de mapping en teksten van `updateUser`-fouten
(`toPasswordUpdateErrorCode`/`passwordUpdateErrorMessage`, inclusief
`reauth_required`), gedeeld met de twee herstelflows. Eerste echte
consument van `Overlay.tsx`'s `"sheet"`-tak, zie "`useShell().overlay`"
hierboven.

**Dienst per sessie, fase 1 (gebouwd en gemerged, [PR #120](https://github.com/BramLambertJansen/ABAS/pull/120), 2026-10-01, ADR
[0016](adr/0016-dienst-hoort-bij-geregistreerde-app-sessies.md) en
[0017](adr/0017-beheer-eist-tweede-factor-en-eigen-loginlimiet.md))**: specs
`docs/features/dienst-per-sessie.md`, `beheer-tweede-factor.md` en
`login-rate-limit.md`. Fase 1 is stand (a): één open dienst, die bij de sessie
hoort waarin hij gestart is (fase 2, de instelling (a)/(b)/(c) en `join_shift`,
is niet gebouwd).
- *Database* (`0027`–`0033`): `bar_sessions`, `shift_sessions`, `bar_devices`,
  `bar_device_members`, `pin_failures`, `admin_notifications`,
  `bar_session_id` op `orders`/`top_ups`/`order_reversals`,
  `shifts.started_session_id`. Guards `require_session` (kern),
  `require_bar_session`, `require_shift_session`, `require_beheer_session`
  (geen `EXECUTE` voor een API-rol). RPC's: `register_bar_session`,
  `touch_bar_session`, `end_bar_session(p_close_shift, p_reason)`,
  `my_bar_state`, `admin_end_shift`, `admin_take_over_shift`,
  `admin_end_bar_session`, `resume_orphan_shift` (`0030`: een bardienst uit de
  bezetting hervat een wees-dienst, alleen als er geen actieve koppeling is),
  `check_beheer_session` (`0031`, voor de invite-route);
  `start_shift(p_activity_type_id)` zonder PIN; A4 in `top_up`
  (`self_top_up_forbidden`); `set_own_pin` weigert vanuit een bar-sessie
  (`0032`); `close_inactive_bar_sessions` (pg_cron, elke minuut). Alleen
  `service_role`: `verify_bar_pin`, `record_bar_password_login`,
  `register_bar_session_server`, `bar_login_options`. `verify_bar_pin` **geeft
  een rij terug in plaats van te raisen**: een `raise` draait de teller van de
  foute poging in dezelfde transactie terug en dan is de lockout waardeloos.
- *Tweede factor en Auth-sessie* (`0034`, `0037`, ADR 0017): beheer eist aal2
  (zie "Beheer-sessie" hierboven); `member_has_verified_factor` (voor geen
  API-rol); `close_bar_session_internal` verwijdert bij elke sluitreden ook de
  rij in `auth.sessions`; `my_bar_state().session.resumable` is `false` voor
  een beheersessie en voor de bar-sessie van een beheerder zonder factor;
  `set_member_role` naar `beheerder` sluit de bar-sessies van dat lid
  (`beheerder_geworden`), met Auth-sessies en PIN-vertrouwen.
- *Loginlimiet* (`0035`, `0036`, ADR 0017): tabel `login_throttle` (RLS aan,
  geen policies, alles ingetrokken; alleen een sha256 van de sleutel, geen
  ruwe IP's), `login_throttle_reserve`/`login_throttle_release` (alleen
  `service_role`; atomair met een advisory lock per bucket en sleutel) en
  `purge_login_throttle` (pg_cron, elk uur, rijen ouder dan 24 uur). Buckets:
  wachtwoord per IP en per lid (`wachtwoord_ip`, `wachtwoord_lid`), PIN alleen
  per IP (`pin_ip`; per lid geldt de lockout na 5 foute PIN's in
  `pin_failures`, geen tijdsbucket), en "vergeten" per lid, per IP en in
  totaal; de waarden staan in `login-rate-limit.md`. Het IP komt uit `x-real-ip`/`x-forwarded-for`
  (`src/lib/clientIp.ts`).
- *Server* (`src/lib/barLogin.ts`, Route Handlers onder
  `src/app/(bar)/inloggen/`: `namen`, `opties`, `wachtwoord`, `pin`,
  `vergeten`): namenlijst (alleen `id` en `name`, geen rol), inlogopties,
  wachtwoordlogin, PIN-login (`generateLink` + `verifyOtp`), wachtwoord
  vergeten. De sessie wordt server-side aangemaakt en geregistreerd vóór de
  browser de tokens krijgt; een mislukte registratie sluit de nieuwe sessie
  (`scope: "local"`). De service-role-client (`src/lib/supabase/admin.ts`)
  wordt alleen server-side gebruikt, door `barLogin.ts`, `inviteMember.ts`
  en `productImage.ts` (Storage-schrijfacties, ADR 0018) (ADR 0006,
  `check:arch`); `SUPABASE_SECRET_KEY` is daarmee nodig voor elke login op
  de bar, ook lokaal en in CI.
- *Cookies*: `abas_apparaat` (`HttpOnly`, 30 dagen, alleen de hash in
  `bar_devices`) bindt de PIN aan een apparaat; `abas_bar_bevestigd` (een
  sessiecookie, niet `HttpOnly`, waarde het `session_id`) is de
  hervat-bevestiging per browser, zodat een tweede tabblad de sessie niet
  sluit en "browser dicht en weer open" eerst om bevestiging vraagt. Het oude
  `abas_tablet` wordt door de middleware weggehaald.
- *Client*: `BarSessieProvider` (`src/features/bar-sessie/`) is de centrale
  afhandeling voor `/` én `/beheer`: fase (uitgelogd / geen bar-sessie /
  hervatten / actief), hartslag (elke tik of toets, hooguit één per minuut), een
  stille poll van `my_bar_state` elke 30 seconden, de melding bij een gesloten
  sessie en lokaal uitloggen. Hooks kennen de sessiecodes
  (`SESSION_ERROR_CODES` in `src/lib/barSessie.ts`: de zes uit ADR 0016 plus
  `aal2_required`) als bekende uitkomst (`notifySessionCode`);
  `reportClientError` logt ze ook niet voor hooks die ze niet zelf kennen. De
  code-invoer voor TOTP is één gedeeld component, `src/components/CodeInvoer.tsx`.
- *Levensduur van frontendstatus* (T01, [PR #134](https://github.com/BramLambertJansen/ABAS/pull/134),
  gemerged 2026-10-01): `BarSessieProvider` houdt Auth en de afmeldmelding
  buiten een `BarSessieScope` met als sleutel gebruikers-ID plus
  Auth-session-ID. Accountwissels en nieuwe logins maken een nieuwe
  schermboom; tokenverversing en MFA van dezelfde sessie behouden hem.
  Auth-/leden-/sessiereads verwerken alleen een actueel antwoord en worden
  bij unmount ongeldig. Een oude scope kan het hervat-cookie niet meer
  veranderen. De expliciete namenlijstlogin bevestigt de nieuwe sessie
  buiten die scope. Dit is de clientkant van ADR 0016/0017; autorisatie en
  modus blijven door de bestaande RPC's afgedwongen. Het
  [verificatieoverzicht](audits/t01-session-regressions.md) bevat de live
  scenario's en de afzonderlijke UI-racetests.
- *Verwijderd*: tablet koppelen (`/koppel`, `src/lib/tabletKoppeling.ts`,
  `BAR_DEVICE_SECRET`), de device sign-in in de middleware, het
  device-account (`SUPABASE_DEVICE_EMAIL`/`SUPABASE_DEVICE_PASSWORD`,
  `device@aurora.local` in de seed), "Mijn account" op `/beheer`
  (`MijnAccountOverlay`, `useSetOwnPin`) en `useOpenShift` (vervangen door
  `useMijnDienst`).
- *Uitrol*: de stappen op het gehoste project (wachtwoord voor elke
  bardienst/beheerder, device-account verwijderen, TOTP aan, rechten van
  `postgres` op `auth.sessions`/`auth.mfa_factors`, de IP-header op Vercel,
  test op het echte tablet) staan in `dienst-per-sessie.md` → Zoals gebouwd →
  Uitrol. Of ze gedaan zijn, staat niet in de repo.

**Bestandsopslag (Storage) (gebouwd en gemerged, PR
[#146](https://github.com/BramLambertJansen/ABAS/pull/146), 2026-10-02)**:
ADR [0018](adr/0018-bestandsopslag-alleen-server-side-schrijven.md),
`docs/features/productafbeeldingen.md` → Zoals gebouwd. De eerste bucket is
`product-images`, publiek.
- *Database*: migratie `0038_productafbeeldingen.sql` maakt de bucket aan
  (`allowed_mime_types = {image/webp}`, `file_size_limit` 1 MB). Ze voegt
  ook `products.image_path` toe (nullable, met een check-constraint op
  `products/<eigen id>/<uuid>.webp`) en de RPC `set_product_image(uuid,
  text) returns text`. `storage.objects` heeft voor geen enkele API-rol een
  schrijfpolicy.
- *Server*: upload, vervangen en verwijderen lopen via de Route Handler
  `src/app/(bar)/beheer/productafbeelding/route.ts` (`POST` multipart,
  `DELETE` JSON). Die doet zelf geen Supabase-aanroep. Het patroon van ADR
  0006, nu voor Storage, staat in `src/lib/productImage.ts`:
  1. `getUser`, de actorcheck en `check_beheer_session` met de
     sessie-gebonden client, vóór de body gelezen wordt;
  2. de grens van 4 MB, op `Content-Length` (met 16 KiB marge voor de
     multipart-omhulling) en op `File.size`;
  3. opnieuw coderen in `src/lib/productImageProcessing.ts` (`sharp`,
     vastgezet op `0.34.5`; formaat uit de bytes, alleen JPEG, PNG en WebP;
     maximaal 512px, WebP, zonder EXIF/GPS);
  4. uploaden met de service-role-client naar een nieuw pad;
  5. `set_product_image` met de sessie-gebonden client. Die geeft het vorige
     pad terug, gelezen onder `for update`. Faalt de RPC, dan wordt het
     nieuwe object weer verwijderd;
  6. het vorige object opruimen via de Storage-API. Mislukt dat, dan blijft
     er een weesbestand. Dat wordt gelogd en de uitkomst is toch succes.

  Gedeelde, pure regels (grens, types, voorcontrole in de browser) staan in
  `src/lib/productImageRules.ts`.
- *Client*: `src/hooks/queries/productRows.ts` is de enige plek die van een
  pad een publieke URL maakt (`getPublicUrl`). Daar staat ook de mapper van
  een `products`-rij naar `AssortimentProduct`, voor de lees- en
  mutatiehooks. `useProductAfbeelding` roept de route aan met `fetch`. Het
  beeldvlak is `src/components/ProductAfbeelding.tsx` (`next/image` met
  `unoptimized`, dus geen `remotePatterns`). Het staat op vier plekken:
  - de verkoop-galerij en -lijst;
  - de beheerlijst;
  - de kop van Product beheren.

  In Product beheren volgt het afbeeldingsblok het pending-model van #126
  (`OpslaanSectie`, serialisatie per product, 30 s-time-out).

Paden zijn onveranderlijk (`products/<id>/<uuid>.webp`), dus de CDN-cache
veroudert nooit. Publiek mag alleen voor niet-persoonsgebonden beeld;
bestanden van of over een lid horen in een private bucket met een eigen
spec.

Gates: `check:rls` controleert dat elke bucket een type- en groottelimiet
heeft en in een test voorkomt, en dat elke storage-policy met haar naam in
een test staat. `check:policy` verbiedt `.storage.from(` buiten de
datalaag. Daarnaast toetst pgTAP dat er geen schrijfpolicy op
`storage.objects` bestaat, over alle buckets.

Open vóór productie (spec → Zoals gebouwd → Open):
- op het gehoste project controleren dat de functie-eigenaar
  `storage.objects` mag lezen (de bestaanscheck in `set_product_image`),
  vóór `supabase db push`;
- handmatig testen op een preview: de upload tegen de echte Storage-API, de
  413 van Vercel en HEIC vanaf een iPad.

Of dat gedaan is, staat niet in de repo.

**Portaltransacties inhoudelijk consistent (gebouwd en gemerged, T09, #129, [PR #155](https://github.com/BramLambertJansen/ABAS/pull/155), `8531101`)**:
`docs/features/portaltransacties-consistent.md` → Zoals gebouwd. Alleen
presentatie in `src/features/portal-dashboard/`: geen migratie, geen RPC, geen
wijziging in `usePortalTransactions`, `src/components/` of `Tabs.tsx`, geen
ADR (ADR 0010/0012 dekken de zichtbaarheid van `reversed_by_name`).
- *Eén rij*: `TransactieRij.tsx` is de enige rij, gebruikt door `SaldoTab`
  ("Recente transacties") en `TransactiesTab`. De `showReversal`-vlag bestaat
  niet meer. In hetzelfde bestand staat `TerugdraaiUitleg`, de uitlegregel
  onder een lijst met minstens één teruggedraaide bestelling.
- *Pure logica* in `transacties.ts` (geen React, geen berekening op
  bedragen): `reversalLines` ("Door: {naam}" en "Reden: {reden}", elke regel
  vervalt bij een lege waarde, het kanaal `reversedVia` komt er nooit in),
  `amountSign` (geen teken bij teruggedraaid), `showReversalExplanation`
  (op de getoonde rijen, dus na een filter), `recentTransactions` (eerste
  `RECENT_TRANSACTIONS_LIMIT` = 5 van de serverlijst, sorteert nooit) en
  `REVERSAL_EXPLANATION`. `transactionDetail` levert alleen nog de
  itemomschrijving of "contant".
- *Tijdzone*: `dateLabel` en `monthKey`/`monthLabel` in `transacties.ts`
  gebruiken vast `PORTAL_TIME_ZONE` (`Europe/Amsterdam`) via `Intl.DateTimeFormat`
  met `timeZone`, niet de zone van het apparaat of de CI-runner. Dit is een
  lokale conventie van het portaltransacties-scherm: `src/lib/date.ts`
  (`formatDate`, `formatTime`) volgt nog de apparaatzone en is niet
  aangepast. Geen gate; een unittest (`test/transacties.test.ts`) bewaakt
  de grenzen.
- *Navigatie*: `PortalDashboard` blijft eigenaar van `tab`. "Alle
  transacties" roept `onShowAll` aan; na de statuswissel zet een effect de
  focus op `tabElementId(idBase, "transacties")` (bestaande export van
  `src/components/Tabs.tsx`).

## Wat het prototype deed maar hier nog niet is besloten

Alleen ter referentie — niets hiervan is in of uit scope besloten. Niet bouwen
zonder een spec in `docs/features/<naam>.md`:

- **Saldocorrectie** — er is geen correctiepad in de app; een onterechte
  opwaardering is alleen met directe databasetoegang terug te draaien (#13,
  zie ook `bar-rpc-autorisatie.md` → Buiten scope).
- **Een wijzigingslogboek voor assortiment, activiteittypes en leden** — een
  audit-tabel plus schrijf-instrumentatie in de elf beheer-RPC's die vandaag
  niets loggen. Eigen architectuurbeslissing (vermoedelijk een ADR); tot dan
  tonen de Logboek-filters Assortiment en Leden een lege staat. Zie
  `logboek.md` → Openstaande vragen (optie 2).
- **Rapportages en export** (CSV/Excel/PDF, periodekeuze, rapportage per
  activiteittype) en de bijbehorende `boekhouder`-/`barmanager`-rollen uit het
  ontwerp. Er bestaan alleen de rollen `lid`, `bardienst` en `beheerder`.

Inmiddels gebouwd en dus niet meer in deze lijst: het Logboek-scherm (#19,
PR #85, `docs/features/logboek.md` — alleen beheerder, org-breed, geld en
aandacht, maximaal 200 rijen) en bestelling terugdraaien (zie Money &
attribution → Bestelling terugdraaien, `docs/features/bestelling-terugdraaien.md`).

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

**`hover:bg-accent-hover` on dark (`text-rail`) text (found #18, fixed
#66, 2026-09-24)**: the mirror-image mistake of the one above. The old
`accent.hover` (#d94d1a) was darker than DEFAULT and failed AA for dark text
(4.25:1) — and for white text too (4.18:1). All 16 uses sit on
`bg-accent text-rail` buttons, so the token itself was changed to a
*lighter* shade (#f1703f, 6.03:1 with `text-rail`) instead of stripping the
hover per button. `test/accentContrast.test.ts` (part of `npm test`) guards
the three pairs in use: `text-rail` on `accent` and on `accent-hover`, and
white on `accent-active`. The rule stays: dark text → `bg-accent` +
`hover:bg-accent-hover`; white/light text → `bg-accent-active`.
