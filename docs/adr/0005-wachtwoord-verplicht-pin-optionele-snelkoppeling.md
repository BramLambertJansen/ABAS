# 0005 — Wachtwoord is verplicht voor bardienst/beheerder; PIN is een optionele, aanvullende snelkoppeling

Status: **geaccepteerd** (Bram, 2026-09-02, naar aanleiding van de
Architect-conceptspec voor issue #42, `docs/features/auth-methode-per-lid.md`).
Hernummerd van 0004 naar 0005 bij het mergen van `main` in deze branch
(2026-09-20): main claimde nummer 0004 intussen voor een eigen, ongerelateerd
ADR ([0004 — PII-kolommen vereisen RPC-gated lezen](0004-pii-kolommen-vereisen-rpc-gated-lezen.md),
uit issue #57/PR #59). Inhoudelijk is dit ADR ongewijzigd t.o.v. de versie
die Bram hierboven goedkeurde.
**Geamendeerd door [ADR 0016](0016-dienst-hoort-bij-geregistreerde-app-sessies.md)
(Beslissing 2, 2026-09-29):** de PIN is een optionele login voor bar-modus,
alleen op een apparaat waar het lid eerder met het wachtwoord inlogde, met
lockout. Hij geeft nooit beheer, en het wachtwoord blijft altijd werken. Een lid
kan in de portal zelf een PIN aan- of uitzetten (niet meer via "Mijn account" op
de bar). Beslissing 1 en 3 blijven ongewijzigd; Beslissing 5 (provisioning voor
leden zonder account) is de uitrolvoorwaarde uit de spec: elke bardienst en
beheerder heeft een werkend wachtwoord.
**Amendeert [ADR 0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)
→ Beslissing 1 alleen.** Beslissing 2 (modus-keuze na login, losse
instanties, geen wisselknop), Beslissing 3 (bar-modus functioneel identiek,
`served_by` uit de bezetting, ongeacht inlogmethode) en Beslissing 4 (login is
toegangscontrole, geen fijnmazige per-actie-beveiliging) van ADR 0003 blijven
onveranderd van kracht — dit ADR raakt alleen de vraag "welke
inlogmethode(s) mag/moet een lid hebben", niet wat er ná het inloggen
gebeurt. ADR 0002 (het sessiemechanisme zelf) is evenmin geraakt.

## Context

De Architect legde Bram, tijdens het opstellen van de spec voor issue #42
(`docs/features/auth-methode-per-lid.md`), een datamodel/RPC-ontwerp voor dat
rechtstreeks volgde uit ADR 0003 → Beslissing 1: "Elk lid met een
`bardienst`- of `beheerder`-rol kiest zelf, op het eigen account, of het met
PIN inlogt of met e-mail/wachtwoord — nooit allebei tegelijk voor hetzelfde
lid." Dat ontwerp introduceerde een exclusief enum-type
(`member_auth_method`: `'pin'` | `'email'`), een RPC
(`set_member_auth_method`) die van de ene methode naar de andere schakelt,
en een wijziging aan `start_shift` die PIN-login blokkeert zodra een lid voor
`'email'` gekozen heeft — precies de "nooit allebei"-handhaving die Beslissing
1 vereist.

Bram's reactie op die conceptspec, letterlijk: **"wachtwoord is altijd
vereist om te hebben. je kan in je profielinstellingen aangeven dat je een
pin wil in plaats van een wachtwoord. maar je kan altijd nog inloggen met
wachtwoord als je wilt. alleen pin kan niet."**

Dat is geen verduidelijking van het either/or-model — het is een ander
model. "Nooit allebei tegelijk" veronderstelt twee gelijkwaardige,
uitsluitende opties; Bram's antwoord beschrijft een basis (wachtwoord,
altijd aanwezig, nooit uitschakelbaar) met een optionele, niet-exclusieve
snelkoppeling erbovenop (PIN). De enige combinatie die niet mag bestaan is
niet "PIN én wachtwoord tegelijk" (dat mag juist wél, en is zelfs de
verwachte eindsituatie voor wie een PIN instelt) maar "alleen PIN, geen
werkend wachtwoord" — het omgekeerde uitsluitingspunt van wat ADR 0003
vastlegde.

Ter illustratie dat dit geen radicaal nieuw idee is binnen deze codebase:
`designs/Lid App.dc.html` (portal, niet bar/beheer) beschrijft voor
gewone leden al exact dit patroon — "Drie inlogmethodes: Wachtwoord, pincode
(alleen op dit toestel) of opnieuw een inloglink per mail. **Pincode is een
sneltoets, geen vervanging van het account.**" (regel 447) — inclusief een
zelfbedienings-"Pincode instellen"-sheet in de eigen profielinstellingen
(regel 680, 714: "Kies 4 cijfers om in te loggen zonder wachtwoord").
Bram's antwoord voor #42 veralgemeniseert dat portal-patroon naar
bardienst/beheerder-leden, in plaats van er los van te staan. Dit is dus
geen nieuw, onbekend concept, wel de eerste keer dat het voor bar/beheer
geldt — vandaar een amendement, niet een losstaand nieuw principe.

## Beslissing

**1. Wachtwoord (e-mail/wachtwoord, via een gekoppeld Supabase Auth-account,
`members.auth_user_id`) is verplicht voor elk lid met rol `bardienst` of
`beheerder`.** Niet optioneel, niet een keuze naast PIN — de basis. Elk zo'n
lid moet altijd via e-mail/wachtwoord kunnen inloggen. Dit vervangt ADR
0003's "kiest zelf... PIN of e-mail/wachtwoord" voor deze ene as: er is geen
keuze meer over *of* er een wachtwoord is, alleen over of er *ook* een PIN
is.

**2. PIN is een optionele, aanvullende snelkoppeling, geen alternatieve
methode.** Een lid kan in de eigen profielinstellingen zelf een PIN
aan- of uitzetten. Een PIN vervangt het wachtwoord niet, schakelt de
wachtwoord-login nooit uit, en wachtwoord blijft te allen tijde bruikbaar —
ook wanneer een PIN actief is. Er is dus geen "terugvaloptie" of
"noodingang"-framing nodig zoals het bar-shell-ontwerp die vandaag rond
e-mail/wachtwoord hangt (`designs/Bar App.dc.html`'s "Anders
inloggen"-sheet): wachtwoord is een gelijkwaardige, permanent beschikbare
voordeur, niet een uitzonderingspad.

**3. De enige verboden staat: alleen-PIN, geen werkend wachtwoord.** ADR
0003's "nooit allebei tegelijk" vervalt volledig voor deze as — beide tegelijk
is de normale, verwachte eindsituatie voor een lid dat een PIN instelt.
Verboden is het omgekeerde: een lid dat via PIN kan inloggen maar niet (meer)
via wachtwoord. In de praktijk betekent dit dat "een PIN instellen" nooit het
gekoppelde account/wachtwoord aanraakt of intrekt — het enige wat een PIN-
toggle doet is `pin_hash` zetten of leegmaken.

**4. Modus-keuze, bar-modus-gedrag en het doel van login (ADR 0003 →
Beslissing 2/3/4) blijven ongewijzigd.** Dit ADR gaat alleen over welke
inlogmethode(s) een lid mag hebben, niet over wat er na een geslaagde login
gebeurt.

**5. Provisioning van het verplichte wachtwoordaccount voor bestaande,
PIN-only leden is hier bewust niet besloten.** Vandaag bestaande
`bardienst`/`beheerder`-leden zonder `auth_user_id` (geen gekoppeld
Supabase Auth-account) voldoen niet aan Beslissing 1 zolang zij geen account
hebben. Of, wanneer en hoe die leden een verplicht account krijgen
(geforceerde migratie nu, geleidelijke overgang, individuele communicatie)
is een beleidsvraag met impact op mensen buiten deze codebase — dat besluit
dit ADR niet zelf, het legt alleen vast dát de eindsituatie voor elk
bardienst/beheerder-lid een gekoppeld account vereist. Zie de herziene spec
(`docs/features/auth-methode-per-lid.md`) → "Openstaande vragen voor Bram"
voor de concrete vraag.

## Verworpen alternatieven

- **Exclusief enum-model vasthouden, met een derde waarde `'both'`**
  (`member_auth_method`: `'pin'` | `'email'` | `'both'`): verworpen — zou
  hetzelfde eindresultaat modelleren als een drieledig enum wat feitelijk een
  booleaans "heeft PIN" is bovenop een altijd-waar "heeft wachtwoord". Een
  enum die twee van de drie mogelijke waarden nooit een zinvol onderscheid
  geven (`'pin'` alleen zou immers per Beslissing 1 niet meer mogen bestaan)
  voegt complexiteit toe zonder een staat te modelleren die echt bestaat. Zie
  de herziene spec → Datamodel voor het gekozen alternatief
  (`pin_hash is not null` als de enige benodigde vlag, geen nieuwe kolom).
- **Terugvallen op het either/or-model en Bram's antwoord interpreteren als
  "een uitzondering voor beheerders"**: verworpen — Bram's woorden ("alleen
  pin kan niet") maken geen onderscheid tussen `bardienst` en `beheerder`,
  en CLAUDE.md → Randvoorwaarden verbiedt de Architect om een
  architectuurbeslissing als uitzondering weg te schrijven.
- **Beheerder-gestuurde PIN-reset voor andere leden toevoegen aan deze
  beslissing**: overwogen (vergelijkbaar met `set_member_role`/
  `set_member_archived`'s beheerder-only patroon), maar niet in dit ADR
  vastgelegd — nu wachtwoord altijd werkt, is er geen "lid zit vast
  buiten een dienst"-noodscenario meer dat een beheerder-ingreep vereist (een
  lid dat een PIN kwijt is, logt gewoon in met wachtwoord en zet de PIN zelf
  opnieuw aan). Zie de herziene spec voor de volledige afweging; dit ADR
  spreekt zich er niet over uit omdat het geen architectuurprincipe is, hooguit
  een schermkeuze.

## Gevolgen

- `docs/adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md` krijgt een
  verwijzing naar dit ADR bovenaan (zelfde vorm als ADR 0002's "aangevuld
  door ADR 0003"-notitie) — Beslissing 1 van dat document is voor de
  either/or-as vervangen door dit ADR, de rest blijft geldend.
- `docs/features/auth-methode-per-lid.md` (issue #42) is volledig herzien op
  basis van dit ADR — geen `member_auth_method`-enum, geen
  `set_member_auth_method`, geen `start_shift`-wijziging, wel een nieuwe
  self-service PIN-toggle-RPC. Zie dat document voor de volledige uitwerking.
- `docs/ARCHITECTURE.md` → "Auth-methode & modus" beschrijft nog het
  either/or-model uit ADR 0003 en moet bijgewerkt worden zodra de herziene
  spec is goedgekeurd en gebouwd — dat is bewust niet in dit ADR gedaan
  (de sectie hoort de gebouwde staat te beschrijven, en #42 is nog niet
  gebouwd), maar wel gesignaleerd hier zodat het niet vergeten wordt.
- `CLAUDE.md` → Auth noemt vandaag nog "een per-lid either/or-keuze (PIN, of
  e-mail/wachtwoord — nooit allebei...)" — diezelfde constatering geldt: bij
  te werken zodra #42 gebouwd is, niet nu al (CLAUDE.md documenteert wat
  geldt in de gebouwde codebase, niet een goedgekeurde-maar-ongebouwde spec).
