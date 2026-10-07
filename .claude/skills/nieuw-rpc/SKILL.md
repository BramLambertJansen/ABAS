---
name: nieuw-rpc
description: Voeg een nieuwe Postgres-RPC toe aan ABAS of definieer een bestaande opnieuw — migratie, guard, rechten, rpc_catalogus-indeling, negatieve tests en de hook in de datalaag. Gebruik bij elke nieuwe of gewijzigde functie in supabase/migrations.
---

# /nieuw-rpc

## Actuele feiten

!`node scripts/kit/feiten.mjs rpc`

!`node scripts/kit/feiten.mjs conventies`

## Stappen (allemaal, in deze volgorde)

1. **Spec**: de RPC staat in een goedgekeurde spec (naam, argumenten,
   klasse, foutcodes). Zo niet: stop en vraag.
2. **Migratie**: nieuw bestand `supabase/migrations/NNNN_naam.sql` (volgende
   nummer). Nooit een bestaande migratie aanpassen. Bij een herdefinitie:
   neem de body uit de *laatste* migratie die de functie definieert.
3. **Vorm**:
   ```sql
   create or replace function public.<naam>(<args>)
   returns <type> language plpgsql security definer
   set search_path = ''
   as $$
   begin
     perform public.require_<…>();          -- guard eerst
     -- volledig gekwalificeerde namen: public.<tabel>
     raise exception '<snake_code>' using errcode = 'P0001';  -- foutpaden
   end $$;
   revoke execute on function public.<naam>(<argtypes>) from public, anon;
   grant execute on function public.<naam>(<argtypes>) to authenticated;  -- alleen klasse client
   ```
   Lees-RPC: liever `returns table(...)` dan `jsonb` (precieze types).
   Geld: nooit een bedrag als argument dat de server gebruikt (behalve
   `top_up_once.amount_cents`); bouw op de `*_once`-route (ADR 0024).
4. **Catalogus**: voeg een rij toe in `supabase/tests/rpc_catalogus.test.sql`
   (client/server/intern; guardvrij alleen met reden). Dit is een gate-pad:
   de PR krijgt het label `gate-wijziging`; de Tester schrijft dit, niet de
   Developer.
5. **Negatieve tests** (Tester): één per weigergrond, plus de happy path, in
   `supabase/tests/<onderwerp>.test.sql`.
6. **Hook**: de aanroep staat in `src/hooks/queries/` of `src/lib/`, nooit in
   een feature. Foutcodes mappen naar Nederlandse tekst.
7. **Contract**: als de app de RPC gebruikt, voeg hem toe aan
   `scripts/check-deployment-schema.mjs` (gate-pad).
8. Draai `npm run check:fast`; `db:test` via CI.
