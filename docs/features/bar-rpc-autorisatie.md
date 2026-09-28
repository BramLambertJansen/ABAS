# Autorisatie op de bar-RPC's: wie mag geld verplaatsen, en wat bewijst een PIN?

**Status (2026-09-28): A2 gebouwd, de rest staat open.** Bram koos A2 als
tussenstap en bevestigde dat publieke signup op het gehoste project uit staat
(vraag 2). A2 is geïmplementeerd in `0023_bar_rpcs_weigeren_lid.sql`, getest in
`supabase/tests/bar_rpcs_weigeren_lid.test.sql`, en geldt naast `top_up` en
`place_order` ook voor `reverse_order_at_bar` — die kwam na deze analyse
(`0020`) en had hetzelfde gat: een lid kon de eigen bestelling terugdraaien.
Open: A3/A4 en B1–B3 (vragen 1, 3–6 hieronder), en of `end_shift`,
`add_shift_member` en `remove_shift_member` dezelfde guard krijgen.

Oorspronkelijke status: analyse, wacht op besluit van Bram. Het document legt
vast wat er feitelijk geldt, welke twee beslissingen openstaan, en wat elke
optie kost. De vragen staan onderaan onder "Nog te beslissen".

Voortgekomen uit de app-review van 2026-09-21/22 (PR #64). Die PR sloot het
gat dat de RPC's *zonder sessie* aanroepbaar waren
(`0018_rpc_execute_alleen_authenticated.sql`). Daarmee is de vraag verschoven,
niet beantwoord: een sessie is nu vereist, maar de RPC's kijken nog steeds
niet naar *wélke* sessie.

## Aanleiding: drie gemeten feiten

Geen van de drie is een inschatting. Alle drie zijn lokaal gereproduceerd
tegen de volledige migratieketen `0001`–`0018` plus `seed.sql`.

**1. Een gewoon lid kan zichzelf onbeperkt saldo bijschrijven.**

`top_up` doet geen enkele controle op de identiteit van de aanroeper. De drie
parameters die het nodig heeft zijn voor een lid-sessie allemaal leesbaar:
het eigen `members.id` (ADR 0007 laat de eigen rij zien), een `shift_id` uit
`shifts` en een `served_by` uit `shift_members` — die twee tabellen staan
sinds `0015` bewust nog op `using (true)` voor iedereen.

Gesimuleerd met een portal-account voor "Anna de Vries" (rol `lid`), tijdens
een gewone open dienst:

```
saldo vooraf:   1240
5× top_up(..., 50000, 'cash', ...)  -> alle vijf geslaagd
saldo achteraf: 251240
```

€2.500 in vijf aanroepen. De €500-cap uit `0016` begrenst één aanroep, niet
het aantal aanroepen. Dit is vandaag niet exploiteerbaar omdat er nog geen
lid-accounts bestaan — `src/lib/inviteMember.ts` nodigt alleen
`bardienst`/`beheerder` uit. Het wordt exploiteerbaar op de dag dat
[#15](https://github.com/BramLambertJansen/ABAS/issues/15) portal-login
oplevert.

**2. Dezelfde blinde vlek geldt voor `place_order`.**

Ook daar geen actorcheck. Dat een lid daarmee niet zomaar *andermans* saldo
kan afschrijven is geen ontwerp maar een neveneffect van ADR 0007: sinds
`0015` ziet een lid de `members`-rij van een ander niet meer, dus kent het de
benodigde UUID niet. Wie die UUID langs een andere weg kent (ooit bardienst
geweest, een screenshot, een gedeeld scherm) kan wél.

**3. De PIN levert vrijwel geen weerstand.**

`members.pin_hash` staat op bcrypt met pgcrypto's default kostenfactor —
geverifieerd op de gehoste omgeving: `$2a$06$`, dus cost 6. Gemeten op een
lokale Postgres 16, één sessie:

| bcrypt-kosten | verificaties/s | volledige PIN-ruimte (10.000) |
|---|---|---|
| **6 (huidig)** | 5.706 | **2 seconden** |
| 8 | 1.421 | 7 seconden |
| 10 | 359 | 28 seconden |
| 12 | 90 | 111 seconden |

`start_shift` heeft geen lockout — dat is een vastgelegde keuze
(`docs/ARCHITECTURE.md` → PIN storage/hashing, "add a lockout later if it
turns out to be needed"). Die keuze is gemaakt onder de aanname dat de
aanroeper al een sessie had. Sinds `0018` klopt die aanname — maar "een
sessie" wordt straks ook "elk lid met een portal-account".

**Hoe de drie op elkaar inwerken.** Feit 3 maakt feit 1 erger dan het op het
eerste gezicht lijkt. Het scenario uit feit 1 vereist een *open dienst*. Een
lid dat geen open dienst treft, kan er zelf een maken: PIN van een willekeurig
bardienstlid brute-forcen (seconden), `start_shift` aanroepen, en dan op elk
gewenst moment zichzelf bijschrijven. De twee beslissingen hieronder zijn dus
niet los van elkaar te nemen.

## Het onderliggende vraagstuk

De bar-flow rust op één aanname, die nergens expliciet is opgeschreven:

> Wie een sessie heeft, staat achter de bar.

Dat klopte zolang de enige sessies de gedeelde tablet-sessie en
bardienst/beheerder-logins waren. CLAUDE.md's `served_by`-redenering bouwt er
expliciet op voort: de attributie is bewust zwak ("niet sterk genoeg om te
bewijzen wélke aanwezige het scherm bediende") omdat *iedereen die erbij kan
sowieso achter de bar staat*. Zodra een lid thuis op de bank een sessie heeft,
is die aanname weg — en dan draagt `served_by` ineens gewicht dat het nooit
had moeten dragen.

De vraag is dus niet "moeten we een check toevoegen", maar: **wat moet een
sessie bewijzen voordat de geldlaag hem vertrouwt?**

## Beslissing A — autorisatie op `place_order` en `top_up`

Vier vormen, oplopend in ingrijpendheid.

### A1. Aanroeper moet zelf in de bezetting staan

`auth.uid()` → `members` → moet in `shift_members` van die dienst staan.

**Werkt niet.** De gedeelde tablet draait op een device-account zonder
`members`-rij (`docs/ARCHITECTURE.md` → "Shared bar-tablet session
mechanism"). Deze eis zet de hele bar-flow stil. Genoemd omdat het de
intuïtieve eerste gedachte is.

### A2. Denylist: weiger een aanroeper met rol `lid`

```sql
if caller_is_lid() then
  raise exception 'no_bar_role' using errcode = 'P0001';
end if;
```

`caller_is_lid()` bestaat al sinds `0015`. Twee regels per RPC, geen nieuw
datamodel, geen gedragswijziging voor bestaande sessies (device-sessie en
bardienst/beheerder vallen er allebei buiten).

**Sluit het bewezen scenario volledig.** Maar het is een denylist: alles wat
géén lid is, mag. Een auth-account zonder `members`-rij passeert — en dat is
precies wat de device-sessie is, dus dat kán niet anders zonder A3.

### A3. Allowlist: aanroeper is de bar-tablet óf heeft een bar-rol

Vereist dat het device-account herkenbaar is in plaats van herkend-aan-de-
afwezigheid-van-iets. Bijvoorbeeld een `device_accounts`-tabel (`auth_user_id`
primary key), gevuld bij het provisionen van een tablet.

```sql
if not (caller_is_device() or caller_has_bar_role()) then
  raise exception 'no_bar_role' using errcode = 'P0001';
end if;
```

**Robuuster dan A2**, en het sluit een vraag die nu open staat: of publieke
signup op het gehoste Supabase-project aan of uit staat. Staat die aan, dan
kan iedereen een account maken dat géén `members`-rij heeft — en passeert dat
account A2's denylist als ware het een bar-tablet. *Dit moet geverifieerd
worden voordat A2 als voldoende geldt;* ik heb het niet kunnen uitlezen via
de beschikbare tooling.

Kosten: één tabel, één migratie, en een handmatige ops-stap bij het
provisionen van een tablet (die stap bestaat al, zie ARCHITECTURE.md →
"Still open: Device account provisioning flow").

### A4. Aanvullend: een opwaardering mag nooit naar jezelf

```sql
if p_member_id = caller_member_id() then
  raise exception 'self_top_up_forbidden' using errcode = 'P0001';
end if;
```

Orthogonaal aan A2/A3 en goedkoop. Raakt de bar-flow niet (de device-sessie
heeft geen `caller_member_id()`), maar sluit het geval waarin een bardienst
zichzelf bijschrijft zonder dat er contant geld tegenover staat. Dat is een
ander dreigingsmodel dan A1–A3 — geen buitenstaander maar een
vertrouwde-maar-onzorgvuldige medewerker.

**Let op:** dit maakt het onmogelijk dat een bardienst die alleen staat
zichzelf legitiem opwaardeert. Of dat een probleem is, is een domeinvraag —
zie "Nog te beslissen", vraag 3.

### Aanbeveling voor A

**A3 + A4**, en A2 alleen als tussenstap wanneer #15 eerder landt dan A3.

A2 is twee regels en sluit het bewezen gat, maar leunt op een aanname over
signup die eerst geverifieerd moet worden. A3 kost een tabel en maakt de
device-sessie voor het eerst een expliciet ding in het datamodel in plaats van
een gat in de gegevens — dat is sowieso nodig voordat er een tweede tablet
komt, en het is de enige vorm die ook na #15 nog klopt.

## Beslissing B — wat `start_shift` moet weerstaan

### B1. Kostenfactor omhoog

`gen_salt('bf')` → `gen_salt('bf', 10)` of `12` in `set_own_pin`. Eén woord.
Bestaande hashes veranderen niet mee; die herhashen bij de eerstvolgende
`set_own_pin`, of eenmalig forceren door iedereen de PIN opnieuw te laten
zetten.

Brengt de volledige PIN-ruimte van 2 s naar 28 s (cost 10) of 111 s (cost 12).
Dat is een factor 14 tot 55 — significant, maar het maakt van "triviaal" geen
"onmogelijk". Verhoogt ook de kosten van een legitieme PIN-invoer, wat op een
tablet niet merkbaar is (één verificatie: 3 ms bij cost 10).

### B2. Lockout of rate-limit per lid

Teller op mislukte pogingen, blokkade na N binnen M minuten. Vergt een tabel
(`pin_attempts` of kolommen op `members`) en logica in `start_shift`.

Dit is de enige optie die een gerichte aanval écht stopt in plaats van
vertraagt. Kosten: een datamodelwijziging, een beslissing over N en M, en een
ontgrendelpad (wie deblokkeert, en hoe, als een bardienst zichzelf buitensluit
tien minuten voor de zaal opengaat). Dat laatste is de echte prijs — het is
geen technisch maar een operationeel probleem in een vrijwilligersvereniging.

### B3. Beperk wie `start_shift` mag aanroepen

Als A3 landt, kan dezelfde allowlist op `start_shift`: alleen de bar-tablet
mag een dienst starten. Een lid-sessie komt er dan niet eens bij om te
brute-forcen.

**Dit is de structurele fix**, en hij valt gratis uit A3. Wat overblijft is
het risico dat iemand fysiek aan de tablet staat — en die persoon staat per
definitie al in de bar.

### B4. Langere PIN

Van 4 naar 6 cijfers is factor 100. Raakt de wireframe (`PinPad.tsx`, de
4-stippenrij) en het dagelijks gebruik. Niet aan te raden als losse maatregel
naast B3; wel te overwegen als B3 niet gekozen wordt.

### Aanbeveling voor B

**B3 (valt uit A3) + B1 als goedkope diepte.** B2 alleen als je het
dreigingsmodel "kwaadwillende met fysieke toegang tot de tablet" serieus wilt
afdekken — en dan eerst het ontgrendelpad bedenken, niet de teller.

B4 zou ik laten liggen: het belast elke dienst elke avond om een aanval af te
weren die B3 al bij de deur tegenhoudt.

## Samenhang, en wat dat betekent voor de volgorde

A3 is de kandidaat waar het meeste aan hangt: hij lost A op, geeft B3 gratis,
en maakt de device-sessie expliciet — iets wat ARCHITECTURE.md al als open
punt noemt voor een tweede tablet. Als er één ticket van gemaakt wordt, is dat
het.

Losse tickets zijn ook verdedigbaar, in deze volgorde:

1. **A2 + A4** — twee RPC-wijzigingen, geen datamodel, sluit het bewezen gat.
   Nodig vóór #15, niet erna.
2. **A3 + B3** — device-account expliciet, allowlist op de drie bar-RPC's.
   Vervangt A2.
3. **B1** — kostenfactor, onafhankelijk van de rest, kan wanneer dan ook.
4. **B2** — alleen bij een expliciete keuze voor dat dreigingsmodel.

## Betrokken shell

Geen. Alle vier de opties zitten volledig in de geldlaag (`supabase/`). De
client verandert hooguit in foutafhandeling: een nieuwe foutcode
(`no_bar_role` bestaat al in `useStartShift`; `self_top_up_forbidden` zou
nieuw zijn in `useTopUp` en `src/features/opwaarderen/messages.ts`).

## Randgevallen die elke optie moet afdekken

- **Device-sessie zonder `members`-rij** — mag alles blijven doen. Bij A2 valt
  dat uit de denylist, bij A3 moet het expliciet in de allowlist.
- **Gearchiveerd bardienstlid met een actieve sessie** — `caller_is_lid()`
  eist bewust geen `not archived` (ADR 0007). Voor een *schrijf*-autorisatie
  ligt dat anders: een gearchiveerd lid hoort geen geld meer te verplaatsen.
  Elke optie moet expliciet kiezen, niet erven.
- **Beheerder die in bar-modus werkt** — draait op de gedeelde sessie
  (ADR 0003), dus geen apart geval.
- **`place_order` met `p_member_id is null`** (gastverkoop) — raakt geen
  saldo, maar wel omzet. Valt onder dezelfde autorisatie.
- **Een bardienstlid dat zichzelf een rondje aanslaat** — legitiem, moet
  blijven werken. A4 raakt alleen `top_up`, niet `place_order`; dat is
  bewust.

## Expliciet buiten scope

- **De brede leestoegang op `shifts`/`shift_members`.** Dat een lid de open
  dienst en de bezetting kan zien is een bewuste reikwijdte-keuze uit ADR
  0007. Het maakt het scenario hierboven makkelijker, maar dichtzetten lost
  het niet op — de UUID's zijn geen geheim en een autorisatiecheck hoort niet
  op obscuriteit te leunen.
- **De device-sessie-cookie scopen weg van `shells/portal`** — hangt aan #15,
  zie ARCHITECTURE.md → "Deferred: device cookie isn't scoped away".
- **Saldocorrectie** — hoort bij
  [#13](https://github.com/BramLambertJansen/ABAS/issues/13). Wel relevant als
  context: zonder correctiepad is een onterechte opwaardering alleen met
  databasetoegang terug te draaien.
- **`end_shift`/`add_shift_member`/`remove_shift_member`** — die hebben
  evenmin een actorcheck, maar raken geen geld. Zelfde allowlist zou logisch
  zijn bij A3; apart benoemen in dat ticket.

## Nog te beslissen

1. **Welke vorm voor A?** A2 als snelle tussenstap, of meteen door naar A3?
   Dit hangt af van wanneer #15 gepland staat — A2 moet er vóór #15 zijn.
2. **Staat publieke signup aan op het gehoste Supabase-project?** Zo ja, dan
   is A2 op zichzelf niet voldoende en is A3 de ondergrens. Ik heb dit niet
   kunnen uitlezen; het staat in de Auth-instellingen van het project.
   (`supabase/config.toml` geldt alleen voor de lokale stack —
   ARCHITECTURE.md waarschuwt daar al voor richting #15.)
3. **Mag een bardienst zichzelf opwaarderen?** A4 verbiedt het. In een
   vereniging waar iemand alleen achter de bar staat en zijn eigen briefje
   van tien in de kas doet, is dat een reëel gebruiksgeval. Alternatief: wel
   toestaan, maar apart loggen voor de boekhouding.
4. **Welke kostenfactor voor B1?** 10 (28 s) of 12 (111 s). En: bestaande
   PIN's laten staan tot ze vanzelf herhasht worden, of iedereen eenmalig
   laten resetten?
5. **Wil je B2 überhaupt?** Zo ja: na hoeveel pogingen, hoe lang, en wie kan
   deblokkeren?
6. **Gearchiveerd lid met actieve sessie** — schrijfrechten intrekken, of
   hetzelfde behandelen als ADR 0007 voor lezen?

## Testgevallen die hoe dan ook nodig zijn

Ongeacht welke optie gekozen wordt, hoort het volgende in `supabase/tests/`
— en het patroon bestaat al sinds `rpc_execute_grants.test.sql`, dat als
eerste naar een níét-ingelogde aanroeper keek:

- `top_up` door een sessie met rol `lid` → weigering.
- `place_order` door een sessie met rol `lid` → weigering.
- `start_shift` door een sessie met rol `lid` → weigering (bij B3).
- Beide RPC's door de device-sessie (geen `members`-rij) → slagen.
- Beide RPC's door een bardienst-sessie → slagen.
- `top_up` naar zichzelf door een bardienst → weigering (bij A4).
- Gearchiveerd lid met geldige sessie → gedrag conform besluit 6.

De bestaande suite dekt hier niets van: elke test draait als `authenticated`
zonder onderscheid naar rol, of als superuser met een gesimuleerde
`auth.uid()` binnen een RPC die de rol toch niet controleert.

## Verhouding tot bestaande beslissingen

- **CLAUDE.md → "`served_by` komt uit de bezetting, niet uit een PIN"** blijft
  ongewijzigd. Dit document raakt niet de *attributie* maar de *autorisatie*:
  wie de RPC mag aanroepen, niet aan wie de verkoop wordt toegeschreven. De
  zwakke-attributie-afweging daar is bewust gemaakt en wordt hier niet
  heroverwogen.
- **ADR 0002/0003** (beheeracties op een eigen e-mailsessie) blijven staan;
  die gaan over beheer-RPC's, die hun actorcheck al hebben.
- **ADR 0007** levert `caller_is_lid()`/`caller_member_id()`, die A2 en A4
  direct hergebruiken.
- **Een nieuwe ADR is nodig bij A3**, niet bij A2/A4: A3 introduceert een
  nieuw begrip in het datamodel (een expliciet device-account) dat een
  volgende feature kan tegenspreken. A2 en A4 zijn een strakkere invulling
  van een bestaande grens, geen nieuwe.
