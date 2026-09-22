-- Elke RPC was aanroepbaar zónder sessie (app-review 2026-09-22).
--
-- Gevonden bij het bijwerken van de gehoste omgeving, bevestigd tegen de
-- echte ACL's daar én lokaal. `place_order`'s privileges zagen er zo uit:
--
--     =X/postgres  anon=X/postgres  authenticated=X/postgres
--
-- Die lege grantee vóór `=X` is PUBLIC. Postgres geeft bij het aanmaken van
-- een functie standaard EXECUTE aan PUBLIC, en Supabase's platform-brede
-- default privileges geven daarnaast nog een expliciete grant aan `anon`.
-- Niets in deze repo heeft ooit een van beide ingetrokken — de
-- `grant execute on function ... to authenticated` in 0001_init.sql (en in
-- elke migratie daarna) leest als een poort, maar is in werkelijkheid
-- overbodig: de toegang kwam al van PUBLIC.
--
-- Wat dat betekende, concreet:
--
--   * `place_order` en `top_up` doen geen `auth.uid()`-check — dat is
--     bewust (CLAUDE.md → Architectuurbeslissingen: de gedeelde
--     bar-tablet-sessie identificeert geen persoon, `served_by` wordt tegen
--     de bezetting gecontroleerd). Die redenering gaat er stilzwijgend van
--     uit dat de aanroeper *sowieso* een sessie heeft. Dat was niet zo: met
--     de publishable key — die per definitie in de clientbundle staat — kon
--     iedereen tijdens een open dienst bestellingen op andermans saldo
--     boeken of saldo bijschrijven.
--   * `start_shift` was daarmee brute-forcebaar zonder account. "Geen
--     lockout in de MVP" (docs/ARCHITECTURE.md → PIN storage/hashing) is
--     een afweging die is gemaakt in de veronderstelling dat er een
--     ingelogde sessie voor nodig was.
--   * `end_shift`, `add_shift_member` en `remove_shift_member` idem.
--
-- De beheerder-RPC's waren niet kwetsbaar: die doen hun eigen
-- ADR-0002-actorcheck via `auth.uid()` en geven `actor_not_found` voor een
-- sessieloze aanroeper. Maar ook die hoeven niet bereikbaar te zijn.
--
-- Niet nieuw geïntroduceerd door een recente migratie: dit staat er sinds
-- 0001_init.sql, en geldt net zo goed op de lokale stack en in CI. De
-- pgTAP-suite zag het nooit omdat elke test als `authenticated` draait —
-- vandaar dat supabase/tests/rpc_execute_grants.test.sql die blinde vlek
-- zelf dichtzet.

-- ── De intrekking ────────────────────────────────────────────────────────
--
-- Een lus over `pg_proc` in plaats van 23 losse regels met handgetypte
-- signaturen: die lijst zou bij de eerstvolgende RPC stilzwijgend
-- incompleet worden, en juist "één functie vergeten" is hier het hele
-- probleem. De expliciete kant zit in de test hieronder, die de invariant
-- vastlegt voor élke functie in `public` — ook eentje die er morgen bij
-- komt.
--
-- `authenticated` en `service_role` blijven ongemoeid: die grants staan
-- expliciet in de migraties en zijn wél bedoeld.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;

-- ── De oorzaak, voor functies die hierna nog komen ───────────────────────
--
-- Zonder dit herhaalt het probleem zich bij de eerstvolgende
-- `create function`: die krijgt opnieuw EXECUTE voor PUBLIC. Belt-and-
-- braces, geen vervanging van de test: `alter default privileges` werkt
-- alleen tegen defaults die door dezelfde rol zijn gezet, en hoe Supabase
-- die precies inricht is platformdetail dat kan wijzigen. De assertie in
-- rpc_execute_grants.test.sql is wat het daadwerkelijk afdwingt.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
