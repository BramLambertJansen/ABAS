# 0019 — Leestoegang is een allowlist: brede leesrechten alleen voor een actieve bar-rol, ieder ander ziet alleen eigen rijen

Status: **geaccepteerd (2026-10-05), geïmplementeerd (PR #156)**. Bram heeft de keuzes voor deze opdracht
bij de Architect gelegd (item A van de review van 2026-10-05); de spec
[`docs/features/leespolicies-allowlist.md`](../features/leespolicies-allowlist.md)
geldt daarmee als goedgekeurd. Gebouwd in migratie `0039` (PR #156, gemerged 2026-10-05). Vervangt
**Beslissing 1** van [ADR 0007](0007-rol-lid-leest-alleen-eigen-rijen.md)
("strikt beperkend") en de alinea daar over `archived`; de rest van ADR 0007
(reikwijdte, gastverkoop, `SECURITY DEFINER`-helpers) blijft staan. Vult
[ADR 0012](0012-portal-eigen-data-voor-elke-rol.md) aan; Beslissing 2 daarvan
(portal-queries scopen expliciet) blijft onveranderd nodig.
**Aangevuld door** [ADR 0022](0022-token-van-beeindigde-sessie-leest-en-schrijft-niets.md)
(2026-10-05): elke leespolicy die niet `using (true)` is, eist daarnaast een
levende Auth-sessie (`(select caller_session_alive()) and (...)`).

## Context

De select-policies op `members`, `orders`, `order_lines`, `top_ups`
(`0015`) en `order_reversals` (`0020`) hebben de vorm
`not caller_is_lid() or <eigen rij>`. Dat is een denylist: wie níet als
`lid` herkend wordt, leest alles. `caller_is_lid()` is onwaar voor:

- elk `authenticated`-account zonder gekoppelde `members`-rij: een
  verkeerd uitgenodigd adres, een account uit een self-signup op de portal,
  een restant van het oude device-account;
- een **gearchiveerde** bardienst of beheerder: de helper negeert `archived`,
  en de portal-login van zo'n lid blijft werken.

Al die accounts lezen daardoor namen, saldi, bestellingen, bestelregels,
opwaarderingen en terugdraaiingen van de hele vereniging. De rechtvaardiging
voor de brede tak, de gedeelde device-sessie zonder `members`-rij, is sinds
ADR 0016 (`0027`) vervallen: dat account bestaat niet meer. De bar-RPC's
zijn al eerder van denylist naar allowlist gegaan (`0023` → `0029`,
`require_*`); de leespolicies niet. `supabase/tests/rls_lid_eigen_rijen.test.sql`
legt het gat in "Blok 3" vast als gewenst gedrag.

## Beslissing

**1. Een select-policy op een tabel met persoons- of geldgegevens is een
allowlist.** De brede tak wordt alleen toegekend aan een aanroeper die
aantoonbaar een bar-rol heeft; elke andere aanroeper valt terug op de eigen
rijen. Vorm:

```sql
using (caller_has_bar_role() or <eigen rij>)
```

Een policy van de vorm `not <helper>() or ...` of `using (true)` op zo'n
tabel is niet toegestaan. `using (true)` blijft alleen voor de globale
tabellen uit ADR 0007 → Reikwijdte (`products`, `app_settings`, `shifts`,
`shift_members`) en `activity_types`.

**2. "Bar-rol" betekent: een gekoppelde, niet-gearchiveerde `members`-rij met
rol `bardienst` of `beheerder`.** Dezelfde rol- en archiefcheck als
`require_session` (`0028`). Een actieve bar-sessie (`bar_sessions`) is
**niet** vereist. Zie "Verworpen alternatieven".

**3. De eigen-rij-tak geldt voor iedereen, niet alleen voor `lid`.** Een
gearchiveerd lid, een gearchiveerde bardienst en een lid dat van bardienst
naar `lid` ging, zien hun eigen historie; dat was de bedoeling van de
`archived`-alinea in ADR 0007 en blijft zo. Een account zonder `members`-rij
heeft geen eigen rijen en ziet dus niets.

**4. `caller_is_lid()` verdwijnt.** Na `0039` gebruikt geen policy of
functie haar nog (de bar-RPC's lieten haar in `0029` al los). Een helper
waarvan de enige zinnige toepassing de denylist-vorm is, nodigt uit tot
hergebruik in een volgende policy.

**5. Een gate bewaakt de vorm.** Een pgTAP-test op `pg_policies`
(`supabase/tests/rls_leespolicies.test.sql`) faalt als een select-policy in
`public` een `NOT caller_…`-tak heeft, of als er een tabel met
`using (true)` bijkomt die niet op de globale lijst staat. Volgens CLAUDE.md
→ "Regel over regels" hoort deze regel in een gate en niet in CLAUDE.md.

## Verworpen alternatieven

- **Brede tak alleen met een actieve bar-sessie** (`bar_sessions` met
  `auth_session_id = auth.jwt()->>'session_id'`, niet beëindigd, niet
  inactief, modus `bar` of `beheer`). Dit sluit meer af: een
  bardienst-sessie op de portal en een access token van een beëindigde
  sessie zouden ook alleen eigen rijen zien. Sinds `0027` is dat technisch
  uitdrukbaar; de bewering in ADR 0012 ("de database ziet geen verschil
  tussen een portal- en een `/beheer`-sessie") klopt niet meer. Nu toch
  verworpen, om drie redenen:
  1. Een lezing raakt de hartslag niet. Na 60 minuten inactiviteit zou elk
     barscherm stil lege lijsten tonen in plaats van een expliciete
     `session_inactive`. De foutafhandeling van de bar is op RPC-fouten
     gebouwd. Dit vraagt een eigen UX-beslissing.
  2. Het raakt elke bar- en beheer-leeshook, en ook de server-side
     actorchecks (`inviteMember.ts`, `productImage.ts`, `useBeheerSession.ts`)
     die vóór of naast de sessieregistratie lezen. Die lezen wel alleen de
     eigen rij, maar de gedragswijziging moet dan per scherm bekeken worden.
  3. Het restgat (een geldig token van een beëindigde sessie, en de portal-sessie
     van een bar-rol) is precies het onderwerp van het aparte, latere item
     "JWT na afmelden". Daar hoort deze afweging bij; deze ADR houdt de
     wijziging klein en sluit de twee gaten die geen enkele rol nodig heeft.
- **De denylist houden en `caller_is_lid()` uitbreiden** ("geen
  `members`-rij of gearchiveerd telt ook als beperkt"). Lost de twee gevallen
  op, maar laat de vorm staan: elk volgend soort account dat niemand voorzag,
  krijgt weer alles. Dit is exact de redenering waarmee `0029` de A2-denylist
  van de RPC's verving.
- **Een subquery op `members` in de policy** (zoals `bar_sessions_select`,
  `0027`). Kan niet op `members` zelf (42P17, infinite recursion; ADR 0007 →
  punt 2) en laat de vier andere policies afhangen van wat `members_select`
  toevallig toestaat. Eén `SECURITY DEFINER`-helper voor alle vijf.

## Gevolgen

- Een account zonder gekoppeld lid ziet in de vijf tabellen niets. De
  portal toont dan al `denied` (`usePortalSession.ts` leest de eigen rij,
  vindt niets), en `/beheer` ook (`useBeheerSession.ts`). Geen zichtbare
  wijziging voor zo'n account, behalve dat een directe API-aanroep niets
  meer oplevert.
- Een gearchiveerde bardienst of beheerder ziet alleen nog de eigen rijen.
  De bar was voor zo'n lid al dicht (`require_session` → `no_bar_role`,
  `set_member_archived` beëindigt de bar-sessies), dus geen enkele
  bar-functie verliest iets.
- Een actieve bardienst of beheerder ziet, in elke sessie, exact wat hij nu
  ziet. ADR 0012 Beslissing 2 blijft dus nodig: in de portal heeft een
  bar-rol via RLS nog steeds de brede leestoegang.
- Gedrag na een rolwijziging of archivering volgt direct: de helper leest de
  rol per statement, net als `require_session` per aanroep.
- Een nieuwe tabel met persoons- of geldgegevens krijgt de vorm uit
  Beslissing 1. Wil een spec een andere vorm, dan is dat een beslissing met
  een eigen ADR, en de gate dwingt af dat die zichtbaar wordt.
