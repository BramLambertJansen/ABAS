# 0012 — De portal toont voor elke rol alleen eigen data; portal-leeshooks filteren expliciet op de eigen rij

Status: **geaccepteerd, geïmplementeerd (2026-09-28, PR #110)** (Bram, 2026-09-28; besluit 1A bij
[`docs/features/portal-profiel.md`](../features/portal-profiel.md), issue
#17, tekst goedgekeurd in PR #104). Wijzigt de sessie-gate uit
[`docs/features/portal-login.md`](../features/portal-login.md) →
Rolzichtbaarheid. Vult [ADR 0007](0007-rol-lid-leest-alleen-eigen-rijen.md)
en [ADR 0009](0009-portal-sessie-eigen-cookienaam.md) aan en vervangt geen
van beide.

## Context

`portal-login.md` (#15) liet de portal alleen binnen voor een sessie die naar
een `members`-rij met rol `lid` herleidt. Een bardienst of beheerder die met
het eigen e-mailadres op `/portal` inlogt, krijgt de `denied`-staat
(`usePortalSession.ts`, `data.role !== "lid"`). Destijds was dat een
redelijke grens: er stond nog niets achter de login, en elk
`members`-record heeft precies één rol.

Issue #17 (portal-profiel) vraagt dat een lid dat óók bardienst/beheerder is,
in de portal de eigen bar-PIN kan instellen. Onder de oude gate kan zo'n lid
de portal nooit bereiken, en zou de PIN-rij onbereikbare code zijn. Daarnaast
hebben bardienst en beheerder een eigen saldo (seed: Tom €9,80, Sanne
€21,00), maar geen enkele plek om hun eigen transacties te zien. Bram in
`designs/chats/chat10.md`: *"op de telefoon kan een gebruiker alleen maar het
LID gedeelte zien — dus saldo, transacties, en instellingen voor het account
(pincode zetten, wachtwoord wijzigen, naam wijzigen)"*.

De reden dat dit een ADR is en geen spec-detail: het verruimen van de gate
verandert een stilzwijgende veiligheidsaanname. ADR 0007 beperkt via RLS
alleen een sessie met rol **`lid`** tot de eigen rijen (`not caller_is_lid()
or <eigen rij>`). Een bardienst/beheerder-sessie valt in de
`not caller_is_lid()`-tak en leest `members`, `orders`, `order_lines` en
`top_ups` van de hele vereniging, zoals de bar dat nodig heeft. Zolang alleen
`lid`-sessies de portal bereikten, was elke portal-query die op RLS leunde
vanzelf veilig. Na deze beslissing niet meer.

## Beslissing

**1. De portal is het lid-deel voor iedereen met een gekoppeld
`members`-record, ongeacht de rol.** `usePortalSession()` rapporteert
`signed-in` voor elke sessie die naar een `members`-rij herleidt (`lid`,
`bardienst`, `beheerder`, ook gearchiveerd, zoals nu al voor `lid`). De
`denied`-staat blijft alleen voor een sessie zónder gekoppelde
`members`-rij. De portal toont voor elke rol **uitsluitend eigen data**:
eigen saldo, eigen transacties, eigen profiel. Er komt geen enkele
bardienst- of beheerfunctie in `shells/portal`. Rolafhankelijk is alleen wat
over de eigen rij gaat, zoals de PIN-rij voor bar-rollen.

**2. Een portal-query op lid-eigen data scopet expliciet op de eigen rij en
leunt nooit op de RLS-narrowing van ADR 0007.** De regel onderscheidt drie
soorten reads:

- **Root-read van lid-eigen data** (`members`, `orders`, `top_ups`,
  `order_reversals`: tabellen waarin elke rij bij één lid hoort). Verplicht
  één van twee vormen:
  - een `.from(...)`-select met een expliciete `.eq("auth_user_id",
    session.user.id)` (op `members`) of `.eq("member_id", <eigen id>)`,
    waarbij het eigen id zelf uit zo'n `auth_user_id`-read komt;
  - een RPC die intern zelf op de aanroeper scopet (`caller_member_id()` of
    `auth.uid()`) en geen parameter heeft om een andere rij aan te wijzen
    (`list_own_transactions()`, `set_own_pin()`, `update_own_name()`).
- **Afgeleide read**: een query die filtert op id's die uit een root-read
  hierboven komen, bijvoorbeeld `usePortalTransactions.ts`, dat `order_lines`
  ophaalt met `.in("order_id", …)` voor de order-id's uit
  `list_own_transactions()`. Toegestaan: het predicaat is eigen-rij-afgeleid,
  ook al staat er geen `auth_user_id` in de query zelf. Dat de id's echt uit
  een eigen-rij-read komen, en niet uit iets wat de client zelf samenstelt,
  is het reviewpunt.
- **Globale data**: tabellen zonder eigen rij en zonder persoonsgegevens, die
  voor elke `authenticated`-sessie bewust volledig leesbaar zijn
  (`app_settings`, een singleton, gelezen door `usePortalAppSettings.ts`;
  `products`; ADR 0007 → Reikwijdte). Vallen buiten de regel, want er is geen
  eigen rij om op te filteren.

Komt er een nieuwe tabel bij, dan hoort bij de spec de vraag in welke van de
drie soorten hij valt. Een tabel met persoonsgegevens die niet bij één lid
hoort, past in geen van de drie en vraagt een eigen afweging (vergelijk ADR
0004/0010).

De bestaande portal-hooks voldoen hier al aan: `usePortalBalance.ts` en
`usePortalSession.ts` doen een root-read op `auth_user_id`,
`usePortalTransactions.ts` een zelf-scopende RPC plus een afgeleide read, en
`usePortalAppSettings.ts` leest globale data. Die toevallige eigenschap wordt
hiermee een regel.

**3. RLS verandert niet.** Geen nieuwe of gewijzigde policy. De brede
leestoegang van een bardienst/beheerder-sessie blijft zoals hij is, omdat de
bar hem nodig heeft. De scheiding zit in wat de portal-code opvraagt, niet in
wat de database zou toestaan.

## Verworpen alternatieven

- **Portal blijft alleen voor `lid`; de PIN alleen via `/beheer` → "Mijn
  account"** (optie 1B in de spec). Dan valt het PIN-deel van #17 in de
  portal weg, en houden bar-rollen geen plek om hun eigen saldo en
  transacties te zien. Verworpen door Bram.
- **RLS ook voor een bardienst/beheerder-sessie tot de eigen rij beperken
  zodra die uit de portal komt.** Technisch niet uit te drukken: de database
  ziet geen verschil tussen een portal- en een `/beheer`-sessie van hetzelfde
  account. Het is dezelfde `auth.uid()`; de scheiding is een cookienaam (ADR
  0009), geen JWT-claim. Een aparte claim toevoegen raakt het hele
  auth-mechanisme voor een probleem dat aan de querykant klein en afdoende op
  te lossen is.
- **Een aparte, gedegradeerde portal-rol of een tweede `auth.users`-rij voor
  bar-rollen.** Twee accounts voor één persoon botst met ADR 0005 (één
  account, wachtwoord verplicht, PIN als snelkoppeling daarop) en maakt
  wachtwoord en PIN beheren dubbel.

## Gevolgen

- `src/hooks/queries/usePortalSession.ts` verliest de rolfilter en geeft
  `role` (en `archived`) mee in de `signed-in`-staat.
  `docs/features/portal-login.md` → Rolzichtbaarheid moet daarop worden
  bijgewerkt, met een verwijzing naar dit ADR.
- **Reviewwerk, geen gate (voorlopig).** Regel 2 is niet betrouwbaar
  statisch te controleren: een filter kan via een variabele, een
  tussenliggende query of een RPC lopen, en een scanner die op
  `.eq("auth_user_id"` zoekt geeft zowel valse alarmen als gemiste gevallen.
  De Reviewer controleert het bij elke nieuwe of gewijzigde `usePortal*`-hook.
  Signaal volgens CLAUDE.md → "Regel over regels": gaat dit in review een
  keer mis, of komt er een derde portal-leesscherm bij, dan is dat het moment
  om een `check:policy`-regel te overwegen, bijvoorbeeld "een
  `usePortal*`-hook met een `.from()` op `members`/`orders`/`top_ups`/
  `order_reversals` moet een eigen-rij-filter hebben of op een allowlist
  staan". Afgeleide reads (zoals `order_lines`) en globale data passen niet
  in zo'n scanner, en horen expliciet op die allowlist.
- **Testverwachting:** een e2e-scenario met een bardienst-sessie op `/portal`
  laat zien dat Saldo en Transacties alleen die bardienst betreffen, ook al
  heeft de sessie via RLS bredere leesrechten. De bestaande e2e-tests die een
  bardienst-login op `/portal` als `denied` verwachten, gaan over op een
  `auth.users`-rij zonder `members`-rij, zodat de `denied`-staat gedekt
  blijft (`portal-profiel.md` → Testplan). De negatieve db-tests van de
  zelf-scopende RPC's (`list_own_transactions.test.sql`,
  `set_own_pin.test.sql`, `update_own_name.test.sql`) dekken de RPC-kant.
- ADR 0003 (modus-keuze bar óf beheer) blijft onveranderd: de portal is geen
  derde modus op het bar-tablet, maar een eigen shell met een eigen cookie
  (ADR 0009). ADR 0005 blijft onveranderd. De portal voegt geen inlogmethode
  toe.
- Een wachtwoordwijziging in de portal wijzigt voor een bardienst/beheerder
  ook het `/beheer`-wachtwoord. Dat volgt uit één account per persoon (ADR
  0005), geen nieuw gevolg, maar door deze beslissing wordt het voor het
  eerst vanuit de portal bereikbaar. Zie `portal-profiel.md` → RPC's →
  Wachtwoord.
