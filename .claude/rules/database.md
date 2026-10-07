---
paths:
  - "supabase/**"
---

# Database: migraties, RPC's, policies

- Migraties zijn append-only. Een bestaande migratie wijzigen of verwijderen
  faalt in `check:migrations`; een fix is een nieuwe migratie die de functie
  opnieuw definieert. Kijk voor de huidige body van een functie naar de
  laatste migratie die haar definieert, niet de eerste.
- Elke nieuwe `public`-functie komt in `supabase/tests/rpc_catalogus.test.sql`
  als client, server of intern. Een client-RPC roept een `require_*`-guard
  aan of heeft een reden; elke SECURITY DEFINER zet `search_path`.
- `search_path = ''` met volledig gekwalificeerde namen (`public.orders`) voor
  elke nieuwe of opnieuw gedefinieerde functie (ADR 0025, besluit 6).
- Nieuwe tabellen en functies krijgen in productie vanaf 2026-10-30 geen
  automatische grants meer. Geef in de migratie expliciet wat nodig is (ook
  `service_role` als server-code of `check:deployment` de functie gebruikt),
  en niets aan `anon`.
- Elke tabel RLS, elke policy een negatieve test (per policynaam), elke
  geldtabel REVOKED. Leespolicies zijn een allowlist met
  `caller_session_alive()` (ADR 0019/0022).
- Geld: nieuwe client-geldpaden lopen via de `*_once`-RPC's met een
  request-UUID (ADR 0024). Maak geen nieuwe aanroepers van `place_order` of
  `top_up` zelf.
- Foutcodes: `raise exception '<snake_code>' using errcode = 'P0001'`.

Besloten maar nog niet gebouwd (ADR 0025 → roadmap); bouw er niet op vooruit
zonder spec: `api`-schema als enige blootgestelde laag, `get_limits()` als bron
voor limieten, testhelpers in een `tests`-schema via `seed.sql`.
