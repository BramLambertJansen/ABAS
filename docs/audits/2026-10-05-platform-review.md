# ABAS — review van GitHub, Vercel en Supabase

Datum: 5 oktober 2026. De waarnemingen hieronder zijn een momentopname.

De code en testopzet hebben een stevige basis. Het belangrijkste probleem zit in de uitrol: de nieuwste app staat op Vercel, maar de bijbehorende databasewijzigingen staan nog niet op het gekoppelde Supabase-project. Daardoor ontbreken beveiligingsreparaties en werkt het productleespad niet volgens het nieuwe contract. Daarnaast ontbreken een afgedwongen merge-gate, een aparte previewdatabase en aantoonbare afspraken over herstel.

## Onderzochte stand en grenzen

Alle drie de MCP-verbindingen zijn daadwerkelijk gebruikt. GitHub leverde repositorygegevens, de huidige `main`, bronbestanden, CI-resultaten en open PR's. Vercel leverde projectgegevens, deployments, buildlogs, env-metadata en runtime-logtellingen. Supabase leverde migratiegeschiedenis, advisors en read-only SQL op catalogi, rechten, functiebronnen, cronresultaten en geaggregeerde clientfouten.

| Onderdeel | Onderzochte stand |
| --- | --- |
| GitHub | Private repository `BramLambertJansen/ABAS`; `main` op `70ad465aa65d1e422c6e9e37d200c8a0abb1ded6` |
| Vercel productie | Deployment `dpl_3d3qxBWvVpG4o9zDEr2xvMQVAkZL`, `READY`, dezelfde commit; alias `abas-one.vercel.app` |
| Supabase | Project `zlyysbywrvaolpslcbid`, naam ABAS, `ACTIVE_HEALTHY`, regio `eu-west-1`, PostgreSQL 17.6.1.155 |
| Koppeling | Vercels `NEXT_PUBLIC_SUPABASE_URL` wijst voor preview én productie naar precies dit Supabase-project |
| Lokale checkout | `main` op `faa32bd`, met bestaande wijzigingen en nieuwe bestanden; loopt achter op GitHub |

De review gebruikt daarom de huidige GitHub-bron voor uitspraken over de gedeployde app. Er is niets gepulld, gereset, gemerged, gedeployd of gewijzigd in Supabase. Alleen dit rapport is aan de lokale workspace toegevoegd. Geheime sleutelwaarden zijn niet opgehaald.

De actuele [CI-run op main](https://github.com/BramLambertJansen/ABAS/actions/runs/37301016293) en de zeven daarvoor opgevraagde runs zijn groen. In de actuele run zijn lint, typecheck, unittests, build, alle architectuur/policy/RLS/migratie/ADR-checks, Playwright, pgTAP en de echte GoTrue-integratietest succesvol uitgevoerd. De [Vercel-build](https://vercel.com/bramlambertjansens-projects/abas/3d3qxBWvVpG4o9zDEr2xvMQVAkZL) is ook succesvol en detecteert Next.js 15.5.23.

Lokaal zijn tests niet opnieuw gedraaid: deze WSL-sandbox heeft geen bruikbare Node-runtime; de Windows-runtime kan er niet starten. De groen geverifieerde CI is bewijs voor de onderzochte GitHub-commit, niet voor de bestaande lokale wijzigingen. Er is geen volledige browserreview, penetratietest of hersteltest op de live omgeving uitgevoerd. Hosted Auth-configuratie, SMTP, redirects, eventuele externe backups en alertinstellingen zijn niet volledig zichtbaar via de gebruikte tools.

## Bevindingen, op impact geordend

### 1. P1 — de app en live database hebben verschillende contracten

GitHub bevat migraties tot `0040`; de live migratiegeschiedenis eindigt op `0037`. Dit is ook in de werkelijke catalogus bevestigd:

| Ontbrekende migratie | Live bewijs | Gevolg |
| --- | --- | --- |
| `0038_productafbeeldingen` | `products.image_path` ontbreekt; geen Storage-buckets; `set_product_image` ontbreekt in de functiecatalogus | De nieuwe productqueries en afbeeldingsfunctie kunnen niet volgens het appcontract werken |
| `0039_leespolicies_allowlist` | `caller_has_bar_role()` ontbreekt; vijf policies gebruiken nog `NOT caller_is_lid()` | Een authenticated-account zonder gekoppeld lid krijgt brede leestoegang tot leden en financiële historie |
| `0040_koppelen_eist_bewijs_van_mailbezit` | `members.invited_auth_user_id` ontbreekt; de live koppel-RPC's gebruiken nog alleen de e-mailmatch | De nieuwe controle op bewezen mailbezit en binding aan het uitgenodigde Auth-account is niet actief; de nieuwe invite-aanroep past niet bij de oude RPC-signatuur |

De clientfoutentabel bevat in de laatste zeven dagen één melding van `useProducts`, SQLSTATE `42703` (ontbrekende kolom), build `85311012864cf9c90c7b8708a774ccd9186fc7bf`. Dit past bij de ontbrekende `image_path`; de foutmelding bevat geen kolomnaam, dus dat verband is een onderbouwde gevolgtrekking.

De leestoegang is een aantoonbare autorisatiefout in de actieve policies: `caller_is_lid()` retourneert false voor een account zonder `members`-rij en de `NOT`-tak verleent dan toegang. Een verborgen scherm of Vercel-login beschermt de rechtstreeks aanroepbare Supabase-API niet tegen een gebruiker met zo'n Auth-token. Zie de al gemergede [reparatie in 0039](https://github.com/BramLambertJansen/ABAS/blob/70ad465aa65d1e422c6e9e37d200c8a0abb1ded6/supabase/migrations/0039_leespolicies_allowlist.sql).

De oude accountkoppeling controleert geen mailbevestiging, `amr`, uitnodigingsaccount of archivering. Of een buitenstaander daarvoor nu zelf een bruikbaar account kan registreren, hangt mede af van de niet geverifieerde hosted Auth-instellingen. Het rapport bewijst geen accountovername of misbruik; wel dat de bescherming van [0040](https://github.com/BramLambertJansen/ABAS/blob/70ad465aa65d1e422c6e9e37d200c8a0abb1ded6/supabase/migrations/0040_koppelen_eist_bewijs_van_mailbezit.sql) ontbreekt.

**Aanpak:** eerst de drie al bestaande migraties beoordelen en gecontroleerd uitrollen, daarna de live catalogus en policies controleren. Voeg een release-gate toe die de verwachte migratieversie vergelijkt met de doeldatabase. Laat app-promotie pas doorgaan na geslaagde database-uitrol en een rooktest tegen die omgeving. Een verse database in CI bewijst niet dat productie is bijgewerkt.

### 2. P1 — CI is een afspraak, geen verplichte merge-gate

GitHub meldt voor `main`: `protected=false`, bescherming uit, verplichte statuschecks leeg. De workflow werkt goed, maar GitHub dwingt niet af dat die groen moet zijn vóór merge. Vercel deployt wijzigingen op `main` afzonderlijk; in deze release was de deployment al klaar voordat de push-CI klaar was.

De rulesets-API retourneert expliciet 403 met de melding dat GitHub Pro of een publieke repository vereist is. Dat is een planbeperking voor deze private repository, geen aanwijzing dat de MCP onbereikbaar is.

**Aanpak:** bescherm `main` met verplichte PR's, succesvolle `check-all` en blokkering van force-push/delete, op een GitHub-plan dat dit voor deze private repo ondersteunt. Houd de repo private. Borg daarnaast de promotie naar productie na de releasechecks. Tot die technische borging bestaat, moet de documentatie dit als handmatige afspraak beschrijven.

Bron: [main](https://github.com/BramLambertJansen/ABAS/tree/main), [CI-configuratie](https://github.com/BramLambertJansen/ABAS/blob/70ad465aa65d1e422c6e9e37d200c8a0abb1ded6/.github/workflows/ci.yml).

### 3. P1 bij gebruik met echte gegevens — preview en productie delen database en beheercredential

Dezelfde Vercel-envdefinities voor `NEXT_PUBLIC_SUPABASE_URL`, de publishable key en `SUPABASE_SECRET_KEY` hebben targets `preview` én `production`. De URL is gecontroleerd; beide omgevingen wijzen naar ABAS. Supabase meldt geen development branches.

Elke preview kan daardoor tegen dezelfde gegevens werken, inclusief servercode met de sleutel die RLS omzeilt. Vercel Authentication op previews beperkt toegang tot de website, maar scheidt de gegevens en serverrechten niet. Een test van verkopen, opwaarderen, uitnodigen of productafbeeldingen kan zo de live omgeving wijzigen.

**Aanpak:** gebruik een aparte staging/previewdatabase met synthetische gegevens en eigen sleutels. Een vaste stagingomgeving volstaat voor deze app; een betaalde branch per PR is geen vereiste. Ken productiecredentials alleen toe aan productie.

### 4. P2 — backup en herstel zijn onvoldoende aantoonbaar

De Supabase-organisatie staat op het Free-plan. In de onderzochte repo staat geen duidelijk beheerplan voor backupfrequentie, bewaarplaats, maximaal dataverlies, hersteltijd en periodieke herstelproeven. Externe backups kunnen bestaan; die zijn niet gecontroleerd.

Voor een app met prepaid saldi is herstel een producteis. Supabase adviseert op Free regelmatig externe exports; de gedocumenteerde dagelijkse backups horen bij betaalde plannen. Storage-objecten zitten bovendien niet in een databasebackup. Zie [Supabase backupdocumentatie](https://supabase.com/docs/guides/platform/backups).

**Aanpak:** leg eerst vast hoeveel transacties verloren mogen gaan en hoe snel herstel moet werken. Richt vervolgens passende backups in en bewijs een herstel naar een aparte omgeving, inclusief controle van saldi/historie. Neem productafbeeldingen apart mee zodra Storage wordt uitgerold. Een Vercel-rollback herstelt de database niet.

### 5. P2 — overmatige tabelrechten; bestaande PR moet opnieuw worden aangesloten op main

Live hebben `anon` en `authenticated` nog `TRUNCATE` en `TRIGGER` op tien public-tabellen en op verschillende Storage-tabellen. Voor `anon` bestaan ook brede DML-grants op de geldtabellen. De huidige RLS-policies blokkeren anonieme gewone DML; dit is geen bewijs dat een anonieme REST-request zomaar saldi kan wijzigen. `TRUNCATE` valt echter niet onder RLS en deze extra rechten horen niet bij de benodigde apprechten.

[PR #150](https://github.com/BramLambertJansen/ABAS/pull/150) behandelt dit al. De PR is open, `mergeable=false` en noemt migratie `0039` en ADR `0019`; die nummers zijn op de huidige `main` inmiddels gebruikt voor de leespolicy-reparatie. Nieuwe nummers en een inhoudelijke rebase zijn nodig.

De vier read-only preflightcontroles uit de PR zijn uitgevoerd: `postgres` heeft TRIGGER op `storage.objects`; `buckets`, `buckets_analytics` en `objects` hebben de bedoelde TRUNCATE-rechten en alle drie `postgres_trigger=true`. De hosted ACL's bevatten ook het PostgreSQL-17-recht `m`; er zijn default-ACL's voor zowel `postgres` als `supabase_admin`. Dit is bruikbaar bewijs voor de herbeoordeling, geen automatische toestemming om de oude PR ongewijzigd uit te rollen.

**Aanpak:** werk PR #150 bij tegen de actuele nummering en PostgreSQL-versie, behoud de bedoelde apprechten en verifieer de invarianttests. Voer geen brede privilegewijzigingen uit zonder dat de resterende datatoegang is gecontroleerd.

### 6. P2 — financiële mutaties hebben nog geen backend-idempotentie

`place_order` en `top_up` hebben geen unieke request-ID. De app bevat inmiddels bescherming tegen dubbelklikken en een melding bij een onbekende uitkomst, maar bij een geslaagde databasecommit gevolgd door een verloren netwerkantwoord kan een volgende poging nog een tweede boeking maken.

Dit is al expliciet gedocumenteerd en staat in [issue #143](https://github.com/BramLambertJansen/ABAS/issues/143). Geen nieuw duplicaat nodig.

**Aanpak:** geef elke financiële intentie een stabiele request-ID. Laat de database binnen dezelfde transactie die ID en het resultaat vastleggen, dubbele uitvoering weigeren of hetzelfde resultaat teruggeven, en afwijkende payloads voor dezelfde ID afwijzen. Test vooral commit-gelukt/antwoord-verloren en parallelle identieke verzoeken.

### 7. P2/P3 — de runtimekeuzes zijn niet gelijk tussen omgevingen

Vercel noemt Node `24.x`; CI gebruikt Node 22. De lokale/CI-databaseconfiguratie gebruikt PostgreSQL 15; hosted Supabase gebruikt 17. Hierdoor worden runtime- en catalogusverschillen pas buiten CI ontdekt. De Storage-ACL's uit bevinding 5 laten al een concreet versieverschil zien.

Vercels deployment noemt regio `iad1`, terwijl de database in `eu-west-1` staat. Serverroutes doen meerdere opeenvolgende Auth/RPC-aanroepen; die locatiekeuze veroorzaakt vermijdbare netwerkafstand. De daadwerkelijke latency is niet gemeten. Kies een ondersteunde Europese functionregio dicht bij de database; zie [Vercel region guidance](https://vercel.com/docs/functions/configuring-functions/region).

De Vercel-projectinstelling meldt bovendien `framework=vite`, terwijl `vercel.json` Next.js aanwijst en de build daadwerkelijk Next.js bouwt. Dat veroorzaakt nu geen aangetoonde buildfout, maar de dashboardinstelling moet gelijk worden getrokken.

**Aanpak:** kies expliciete ondersteunde versies, stem CI en deploy daarop af en controleer database-upgrades op een aparte omgeving. Zet de functionregio en de juiste frameworkinstelling expliciet vast.

### 8. P2 — veel uitleg, maar onvoldoende actuele instap- en beheerinformatie

De ADR's en featurespecs beschrijven autorisatie, geldregels, alternatieven, edge cases en negatieve tests uitgebreid. Dat is een sterke eigenschap van deze repo.

De actuele [README](https://github.com/BramLambertJansen/ABAS/blob/70ad465aa65d1e422c6e9e37d200c8a0abb1ded6/README.md#L15) zegt echter nog dat `docs/features` leeg is en geen features zijn gebouwd. De quickstart noemt geen benodigde Node-versie, Docker/Supabase-installatie of volledige startprocedure. `ARCHITECTURE.md` mengt huidige toestand, oorspronkelijke scaffoldstatus, historische verificatiebeperkingen en changelog. Featurestatus betekent vaak gebouwd/gemerged; of iets ook live is, blijft onduidelijk.

**Aanpak:** maak een korte actuele README, een afzonderlijk document voor het huidige systeem en een beheerhandleiding voor omgevingen, secrets, migratie-uitrol, eerste beheerder/MFA, Auth-redirects/SMTP, incidenten, backup en herstel. Houd historische veranderingen in ADR's/changelog. Noteer per release de appcommit én toegepaste databaseversie. Voeg een korte gebruikshandleiding voor barvrijwilligers en beheerders toe.

### 9. P3 — gerichte hardening en performance

- De security-advisor meldt een niet vastgezette `search_path` voor `bar_inactivity_limit`. De functie is een constante `interval '60 minutes'`, security invoker en niet uitvoerbaar door anon/authenticated. Lage urgentie; zet de context wel expliciet vast. [Advisor-uitleg](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- Leaked-password protection is uit. De organisatie is Free; deze functie vereist Pro of hoger. Weeg dit mee bij de keuze voor een productieplan, samen met backups. [Password security](https://supabase.com/docs/guides/auth/password-security).
- De performance-advisor meldt 22 foreign keys zonder dekkende index en vier policies met per-rij Auth-evaluatie. Prioriteer joins op `order_lines.order_id`, transacties per lid/dienst en sessiechecks. De tabellen zijn nu klein; dit zijn schaalverbeteringen, geen gemeten incidenten. Pas indexen toe op basis van queryplannen. [FK-advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS-initplan-advisor](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
- `admin.ts` heeft op de onderzochte `main` geen `import 'server-only'`. `check:arch` controleert directe imports, niet de volledige transitieve importgraaf. Voeg de buildbarrière toe aan serverclients en controleer indirecte imports; dit is hardening, geen vastgesteld secretlek. Een recent bekeken previewcommit bevat al een spec voor dit werk, maar die staat niet op de onderzochte `main`.
- De repo heeft een lockfile en CI gebruikt `npm ci`. Er is in de onderzochte tree/workflow geen automatische dependency-updateconfiguratie of kwetsbaarheidsscan gevonden. Voeg kleine periodieke update-PR's en een passende scan toe. Er is in deze review geen volledige dependency-audit uitgevoerd.

De 41 advisor-waarschuwingen voor authenticated-callable SECURITY DEFINER-functies zijn niet automatisch 41 beveiligingslekken. De RPC-laag heeft deze bevoegdheid bewust nodig omdat directe geldwrites verboden zijn; functieguards en negatieve tests bepalen of een endpoint veilig is. Blind omzetten naar SECURITY INVOKER breekt dit patroon. Ook de vijf tabellen met RLS zonder policy passen bij service-role/interne tabellen en zijn standaard gesloten. Zie [de SECURITY DEFINER-advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Wat goed is opgezet

- Eén Next.js-app met afzonderlijke bar- en portalshells en een herkenbare feature/datalaag. Voor deze verenigingsapp is dat een passende omvang; er is geen aanleiding voor microservices.
- Geld wordt serverside in transacties afgehandeld; prijzen worden als snapshot bewaard en attributie wordt tegen de bezetting gecontroleerd. Live zijn directe INSERT/UPDATE/DELETE-rechten voor authenticated op leden en financiële tabellen ingetrokken.
- Alle 18 public-tabellen hebben live RLS. `pin_hash` en `email` zijn niet rechtstreeks selecteerbaar door authenticated. Geen van de onderzochte public-functies geeft anon EXECUTE.
- Beheermodus, persoonlijke sessies, tweede factor en rate limiting zijn beschreven, serverside bewaakt en uitgebreid getest. Portal/bar gebruiken aparte cookie-identiteiten.
- Productafbeeldingen hebben op main een zorgvuldig serverpad: actor/session-check vóór upload, opnieuw coderen, beperkte bucket, unieke objectpaden, sessiegebonden RPC voor de databaseverwijzing en compensatie bij fouten. De bijbehorende migratie moet nog live.
- De cronjobs draaien echt: in de afgelopen 24 uur slaagden 1.440 sessieopruimruns, 24 throttle-opruimruns en één client-error-opruimrun. De Vercel-runtimequery gaf geen error/warning/fatal-tellingen in het onderzochte productievenster; dat is beperkte logdekking, geen bewijs dat alle clientflows foutloos zijn.

## Aanbevolen uitvoering

1. Leg backup/herstel en de doeldatabase vast; beoordeel en rol de bestaande `0038`–`0040` gecontroleerd uit. Verifieer productreads, policies en de gewijzigde invite-RPC. Voer de hosted invite/wachtwoord-rooktest uit de bestaande accountspec uit in een passende testomgeving; die is in deze review niet uitgevoerd.
2. Borg PR/CI en databaseversie vóór productiepromotie. Laat statusrapportage onderscheid maken tussen groen in CI, gemerged en daadwerkelijk uitgerold.
3. Scheid staging/preview van productie; stem Node/Postgres-versies en functionregio af.
4. Werk PR #150 bij, voeg server-only-afscherming toe en pak de al bestaande idempotentie-issue op.
5. Maak documentatie over starten en beheren kort en actueel; voeg aantoonbare herstelproeven en periodieke platformchecks toe.

De eerstvolgende verbetering is dus het sluitend maken van de releaseprocedure. Verschillende noodzakelijke reparaties zijn al gebouwd en getest; de live omgeving moet ze nog krijgen.
