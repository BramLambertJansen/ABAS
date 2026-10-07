## Wat en waarom

<!-- Eén alinea. Verwijs naar de spec: docs/features/<naam>.md (status goedgekeurd). -->

## Spec en ADR

- Spec:
- ADR (nieuw of geraakt):

## Geld, attributie en rollen

- [ ] Geen bedrag van de client dat de server gebruikt; nieuwe geldpaden via `*_once`
- [ ] `served_by` server-side tegen de bezetting (n.v.t. als geen geld)
- [ ] Rolzichtbaarheid zoals de spec

## Database

- [ ] Nieuwe migratie(s), geen bestaande gewijzigd
- [ ] Nieuwe functies in `rpc_catalogus`, met guard en `search_path = ''`
- [ ] Negatieve test per nieuwe policy en per weigergrond

## Hergebruik en UX

- [ ] Componenten uit de catalogus (`node scripts/kit/catalogus.mjs`); nieuw component heeft een README-rij
- [ ] Staten (laden, leeg, fout, pending, succes, verouderd) zoals de spec
- [ ] Toetsenbord, focus en contrast nagelopen

## Gates

- [ ] `npm run check:fast` lokaal groen
- [ ] Wijzigt gates of bestaande tests → label `gate-wijziging` (Bram)
- [ ] Ratchet alleen gedaald (`eslint-suppressions.json`, `.kit/baseline.json`)
