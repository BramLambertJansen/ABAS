---
paths:
  - "src/app/auth/**"
  - "src/app/(bar)/inloggen/**"
  - "src/app/(bar)/beheer/**"
  - "src/app/portal/**"
  - "src/features/bar-inloggen/**"
  - "src/features/bar-sessie/**"
  - "src/features/portal-login/**"
  - "src/features/portal-profiel/**"
  - "src/lib/barLogin*.ts"
  - "src/lib/barSessie.ts"
  - "src/lib/portalSessie.ts"
  - "src/lib/sessieBevestigen.ts"
  - "src/lib/mfa.ts"
  - "src/lib/supabase/**"
  - "src/hooks/queries/use*Login.ts"
  - "src/hooks/queries/use*Session.ts"
  - "src/middleware.ts"
---

# Auth en sessies

Kern uit ADR 0002/0003/0005/0012/0016/0017; lees die bij twijfel, niet deze
samenvatting alleen.

- Portal (elke rol met een gekoppeld lid): e-mail met magic link of wachtwoord;
  eigen cookienaam, gescheiden van bar/beheer (ADR 0009).
- Bardienst/beheerder hebben altijd een wachtwoord. Een PIN is een optionele
  snelkoppeling, alleen voor bar-modus, op een apparaat waar eerder met het
  wachtwoord is ingelogd, met lockout. Alleen-PIN is de enige verboden staat.
- Modi: bar óf beheer, losse sessies, overstappen is uitloggen. Geen
  wisselknop.
- Beheer eist modus beheer + aal2 (TOTP), server-side afgedwongen. Een
  PIN-login geeft zonder tweede factor nooit beheer.
- `start_shift` heeft geen PIN (sinds migratie 0029): de dienst hoort bij de
  ingelogde bar-sessie (ADR 0016).
- Service-role-code staat alleen in modules met `import "server-only"`
  (ADR 0021); `check:arch` volgt de importgraaf.
