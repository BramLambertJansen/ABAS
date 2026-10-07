---
paths:
  - "src/hooks/**"
  - "src/lib/**"
---

# Datalaag

- Queries, RPC's en storage-aanroepen alleen in `src/hooks/queries/` en
  `src/lib/`. Features en shells krijgen geen Supabase-client.
- Fouten via `src/lib/clientErrors.ts`, geen kale `console.error` in
  `src/hooks/queries/`.
- Geldmutaties via `src/lib/moneyRequest.ts` (request-UUID, onbekende uitkomst
  bewaren, `inspect_money_request`); nooit een bedrag meesturen dat de server
  gebruikt.
- Leeshooks: gebruik `useStaleLezing` (last-request-wins, oude data blijft
  staan) in plaats van een nieuw `useState`/`useEffect`-patroon.
- Zoek vóór een nieuwe hook in `src/hooks/queries/README.md` of
  `node scripts/kit/catalogus.mjs hooks`.

Besloten maar nog niet gebouwd (ADR 0025 → roadmap): gegenereerde
`Database`-types, één ingang `src/lib/rpc/`, TanStack Query voor lezen en
invalidatie, een gegenereerd foutcoderegister. Een nieuwe hook volgt nu het
bestaande patroon; de migratie gebeurt per spec.
