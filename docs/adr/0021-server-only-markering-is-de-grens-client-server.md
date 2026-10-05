# 0021 — De grens tussen server- en clientcode is de `server-only`-markering; `check:arch` volgt de importgraaf transitief

Status: **geaccepteerd (2026-10-05)**. Bram heeft de keuzes voor deze
opdracht bij de Architect gelegd (item C van de review van 2026-10-05); de
spec [`docs/features/server-only-afscherming.md`](../features/server-only-afscherming.md)
geldt daarmee als goedgekeurd. Vult [ADR 0006](0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md)
aan: het "Signaal voor een mogelijke toekomstige gate" daar is hiermee
ingelost, de rest van ADR 0006 blijft staan. Raakt ADR 0018 niet
(`productImage.ts` blijft de enige Storage-schrijver).

## Context

`src/lib/supabase/admin.ts` maakt de service-role-client (omzeilt RLS,
leest `SUPABASE_SECRET_KEY`). `check:arch` regel 4 vangt alleen een
*directe* import van dat bestand vanuit clientcode, op een regex die
`admin.ts` met extensie, `import()`, `require()` en een kale
`import "x"` niet ziet. `barLogin.ts`, `inviteMember.ts` en
`productImage.ts` importeren `admin.ts`; een clientbestand dat één van die
drie importeert, passeert de gate. Next.js zou zo'n bestand in een
clientbundel opnemen. De key zelf lekt niet (Next inlinet alleen
`NEXT_PUBLIC_*`), maar de code van de server-acties en hun afhankelijkheden
wel, en de fout is pas tijdens runtime zichtbaar.

## Beslissing

1. **Een module die alleen op de server mag draaien, begint met
   `import "server-only";`.** Het `server-only`-package wordt een expliciete
   dependency. Next.js laat de build falen zodra zo'n module, direct of via
   een andere module, in de clientgraaf terechtkomt. Dat is de afdwinging;
   de markering hoort in het bestand zelf, niet in een lijst elders.
2. **Verplicht gemarkeerd** zijn de drie bestanden onder `src/lib/supabase/`
   die serverstate of een secret raken: `admin.ts` (service-role),
   `server.ts` en `portalServer.ts` (`next/headers`-cookies). Elke module
   die één van deze importeert, is daarmee transitief server-only; die krijgt
   de markering niet nog eens (één bron, geen herhaling die uit de pas kan
   lopen).
3. **Nieuwe secrets volgen dezelfde regel.** Een toekomstige module die een
   secret leest of RLS omzeilt (bijvoorbeeld de webhook-verificatie voor
   iDEAL, CLAUDE.md → Opwaarderen) begint met `import "server-only";` en komt
   in de verplichte lijst van `check:arch`. `SUPABASE_SECRET_KEY` blijft
   alleen in `admin.ts` gelezen worden (ADR 0006).
4. **`check:arch` volgt de importgraaf transitief** vanaf elke clientmodule
   (`"use client"` of een van de clientmappen) en faalt als die een
   gemarkeerde module bereikt, met de keten in de melding. Hij herkent
   statische, kale, dynamische (`import("…")`) en `require("…")`-imports en
   lost `@/`- en relatieve paden op, met of zonder extensie. Een
   type-only-import (`import type`/`export type`) telt niet: die verdwijnt
   bij compilatie. Een niet-letterlijke `import()`/`require()` in `src/` is
   een fout, omdat de graaf hem niet kan volgen. Dit is aanvullend op de
   build: het geeft de fout al in de pre-commit-hook (`check:fast`) en het is
   met fixtures te testen in `npm test`.
5. **Unit-tests laden gemarkeerde modules niet echt.** De bestaande tests
   vervangen `admin.ts` en `server.ts` al door nep-modules via een
   resolve-hook. Laadt een test ooit wel een gemarkeerde module, dan wijst
   die hook `server-only` naar Next's lege module
   (`next/dist/compiled/server-only/empty.js`), zoals
   `test/fakes/resolve-hooks.mjs` al doet. Geen `--conditions=react-server`
   op het hele testscript: die conditie verandert ook wat `react` exporteert.

## Gevolgen

- `check:arch` regel 4 (directe import van `admin.ts`) gaat op in de
  transitieve regel; die vangt het directe geval ook.
- Clientcode haalt types en pure regels uit aparte modules
  (`barLoginTypes.ts`, `productImageRules.ts`), zoals nu al gebeurt. Een
  server-only module exporteert geen waarden die clientcode nodig heeft.
- Of `next build` de markering echt afdwingt, is gedrag van Next.js. Dat
  testen we niet in CI met een tweede build (een aparte fixture-app kost
  een volledige extra build per run en test het framework, niet onze code).
  De Developer bewijst het één keer handmatig bij de bouw (spec → Testplan).
  In CI testen we de eigen helft: dat de markeringen er staan en dat geen
  clientmodule er een bereikt.
