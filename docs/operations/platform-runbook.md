# ABAS platformrunbook

Gecontroleerd op 2026-10-05. Open acties staan expliciet gemarkeerd.

## Omgevingen

| Onderdeel | Huidige inrichting |
| --- | --- |
| GitHub | Private `BramLambertJansen/ABAS`, productiebranch `main` |
| Vercel | Project `abas`, productiealias `abas-one.vercel.app`, Node.js 24 |
| Supabase productie | `zlyysbywrvaolpslcbid`, `eu-west-1`, Postgres 17 |
| Lokale ontwikkeling / CI | Supabase CLI 2.118.0, Postgres 17 volgens `config.toml` (deze wijziging) |
| Databaseversie productie | Migraties tot en met `0040`, gecontroleerd op 2026-10-05 |
| Vercel functionregio | Deze PR stelt `dub1` in; pas actief in een nieuwe deployment |

**Open: previews delen nu de productiedatabase.** Gebruik previews niet voor
testorders, opwaarderingen, invites of accountwijzigingen. Doe zulke tests
lokaal/CI tot previews eigen Supabase-credentials hebben. Andere projecten
van de eigenaar horen niet automatisch bij ABAS.

Een stagingomgeving vraagt een nieuw project of databasebranch, eigen
testdata, Auth callback-URL's en Vercel preview-env-vars. Inventariseer eerst
planlimieten en kosten. Controleer daarna dat preview- en productie-URL's
verschillen. Een env-wijziging vereist een nieuwe deployment. Promoveer geen
preview-artifact met ingebouwde staging-URL naar productie: `NEXT_PUBLIC_*`
wordt bij de build vastgezet. Bouw productie met productievariabelen.

## Credentials

`NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` horen bij
dezelfde database. `SUPABASE_SECRET_KEY` is alleen server-side en omzeilt RLS;
beheer hem als sensitive env-var op Vercel. De drie Supabase-serverclients
zijn gemarkeerd met `server-only`. Houd secrets buiten git, screenshots en
logs. Nieuwe env-vars werken pas na een nieuwe deployment.

## Release en migraties

1. Open een PR vanaf actueel `main`; behoud toegepaste migraties. Maak nieuwe
   migraties met de Supabase CLI, volg de viercijferige repo-conventie en
   controleer nummerconflicten met open PR's.
2. Wacht op groene CI voor de actuele PR-head, inclusief pgTAP, GoTrue en
   Playwright. Alleen een groene Next-build is onvoldoende.
3. Controleer de migratiegeschiedenis en een recente herstelbare backup.
   Na linken aan het juiste project: `supabase migration list --linked` en
   `supabase db push --linked --dry-run`. Bevestig project-id vóór een write.
4. Pas backwards-compatible database-uitbreidingen vóór de app toe met
   `supabase db push --linked`. Bij incompatibele Auth-/RPC-wijzigingen:
   kies een rustig moment, controleer sessies/invites en plan overgang en
   rollback vooraf. Geen losse handmatige DDL buiten een migratie.
5. Controleer versies, kolommen, RPC-signaturen en rechten. MCP
   `apply_migration` kan timestampversies toekennen: laat de geschiedenis
   overeenkomen met de repo. Correctie vereist een gecontroleerde mapping
   van exact dezelfde al toegepaste SQL; voer die migratie niet opnieuw uit.
6. Merge na review en groene CI. Vercel bouwt `main` voor productie en draait
   `check:deployment` vóór de build. Controleer deploymentstatus, build-SHA,
   regio, login, producten en de bedoelde feature. Financiële smoke tests
   vereisen een afgesproken beheerhandeling.

`check:deployment` leest met de server-key alleen het PostgREST OpenAPI-schema.
Hij vereist `products.image_path`, `members.invited_auth_user_id`,
`set_product_image` en de tweeargumentige `mark_member_invite_sent`.
Hij faalt gesloten bij ontbrekende velden/signaturen, ontbrekende env-vars,
netwerk-/authfouten of onverwachte antwoorden. Geen datareads of RPC-calls.
Werk het contract bij als de app nieuwe databasevereisten krijgt.

De controle bewijst geen RLS-, Auth- of data-integriteit en leest geen
migratiegeschiedenis. CI controleert het contract tegen de echte lokale
stack; unittests bewaken ook afwijzing van het oude schema.

**Open: technisch afgedwongen merge-/releasegate.** `main` is onbeschermd;
GitHub meldt dat branchregels voor deze private repository een betaald plan
vereisen. De procedure is dus een afspraak. Vercel wacht niet op volledige
GitHub CI. Maak de repository hiervoor niet openbaar.

## Rollback

Bij een appfout: selecteer de vorige goede Vercel-deployment nadat je hebt
gecontroleerd dat die met de huidige database werkt. Een Vercel rollback
draait geen SQL terug. Bij een databasemigratiefout: stop verdere uitrol,
verzamel de fout en herstel bij voorkeur met een nieuwe vooruitgaande
migratie. Verwijder geen toegepaste historie om een migratie te rerunnen.
Een restore overschrijft data; spreek het dataverliesvenster vooraf af.

## Backups en herstel

**Open: automatische externe backups en een bewezen restore.** Het plan is
Free; deze review bewijst geen bestaande externe backup. Supabase adviseert
Free-projecten zelf backups buiten Supabase te bewaren. Databasebackups
bevatten geen Storage-bestanden. Zie de officiële
[backupdocumentatie](https://supabase.com/docs/guides/platform/backups).

Voorstel voor de eigenaar: dagelijkse versleutelde externe databasebackup,
30 dagen retentie, aparte Storage-objectbackup met objectnamen/checksums,
beperkte toegang en alarm bij een mislukte of verouderde backup. Kies opslag,
kosten, maximaal acceptabel dataverlies (RPO) en hersteltijd (RTO).

`supabase db dump --linked` heeft schema-, data-only- en role-only-opties.
Controleer de CLI-help en actuele restorehandleiding: Auth/Storage-schema's
hebben specifieke export-/restorebeperkingen. Dumps horen versleuteld buiten
de repo. Verifieer dat noodzakelijke Auth-gegevens zijn meegenomen; alleen
`public` exporteren is geen volledige herstelstrategie.

Test restore in een nieuwe geïsoleerde omgeving: schema, data en Auth volgens
de Supabase-handleiding, Storage-objecten terugzetten, callbacks instellen,
rechten/RLS controleren en login/saldo/historie/afbeeldingen verifiëren.
Noteer exporttijd, checksum, restoreduur en resultaten. Doe dit niet op
productie of een ander bestaand project. Een export telt pas als herstelbaar
na zo'n geslaagde test.

## Incidenten en onderhoud

- App/build: Vercel build- en runtime-logs; vergelijk SHA en env-targets.
- Clientfouten: `public.client_errors`, gekoppeld aan build-SHA; log geen keys.
- Database/Auth: Supabase logs, cronstatus en Advisors. Inspecteer bij
  SECURITY DEFINER-waarschuwingen guards, EXECUTE-grants en search_path;
  verwijder de RPC niet automatisch.
- Dependencies: volledige `npm audit` én `npm audit --omit=dev`. Deze PR
  patcht Next.js naar 15.5.27, Sharp naar 0.35.5 en Next's PostCSS via een
  override naar 8.5.29. Herbeoordeel de override bij een volgende Next-upgrade.
  Zeven hoge meldingen blijven in dev-tooling via `braces`; npm stelt een
  grote Tailwind-upgrade voor. Plan die met CSS-/a11y-regressiecontrole.

## Open reviewacties

| Actie | Stand |
| --- | --- |
| Productie `0037` → `0040` | Uitgevoerd, SQL-catalogus gecontroleerd op 2026-10-05 |
| Server-only, buildguard, dependency-patches, Node 24 in CI | Deze PR |
| Next.js-projectinstelling en EU-functionregio | Projectinstelling gecorrigeerd op 2026-10-05; regio na nieuwe deployment |
| Eigen previewdatabase | Free-aanmaak geweigerd: twee actieve projecten; geen ander project gewijzigd |
| Externe backup + restoreproef | Bestanden + herstelprocedure voorbereid; automatische opslag bewust uitgesteld |
| CI verplicht vóór merge/deploy | Vercel Deployment Check activeren of releaseworkflow configureren |
| TRUNCATE/TRIGGER-grants | Rechten uit PR #150 op main overgenomen als 0041/ADR 0022; CI vereist |
| Geld-RPC-idempotentie | Voorstel goedgekeurd; 0042/ADR 0023, clientherstel en concurrencytests voorbereid |
| Postgres 15 lokaal versus 17 productie | Config op 17; volledige CI moet de stack bewijzen |

## Vervolgronde — besluiten en activering

Bram bevestigde PANGU en uitsluitend Free voor ABAS Preview. Supabase weigerde
op de limiet van twee actieve Free-projecten. Er is geen project gewijzigd,
gepauzeerd of opgewaardeerd. De previewguard weigert nieuwe builds met de
productie-URL. Bestaande previewdeployments blijven naar productie wijzen;
een guard is geen bewijs van werkende volledige isolatie.

Nieuwe financiële wrappers vereisen migratie 0042 vóór de nieuwe app. Het
buildcontract controleert hun namen en argumenten. De oude RPC's blijven
bestaan voor een compatibele overgang. Hun oorspronkelijke retryrisico verdwijnt
pas zodra alle clients de nieuwe versie gebruiken. Wrappers hebben EXECUTE
voor authenticated en service_role zodat de server-side schemacontrole ze kan
zien; beide doorlopen dezelfde sessieguards. De receipt-tabel en interne
helpers geven geen API-rol toegang. De migratie is door de CLI aangemaakt en
naar 0042 hernummerd volgens de repo-conventie.

Voor backups koos Bram uitsluitend de bestanden en procedure voor te bereiden.
Zie [backup-restore](backup-restore.md) en `scripts/backup-platform.mjs`.
Geen productie-export, scheduler, retentiebeleid of externe opslag geactiveerd.

### CI als releasevoorwaarde

De voorkeur is een [Vercel Deployment Check](https://vercel.com/docs/deployment-checks)
voor GitHub-check `check-all`: Project → Settings → Deployment Checks → Add
Checks → GitHub → selecteer `check-all`, laat production automatic aliasing aan.
Verifieer met een gecontroleerd falende CI-run dat productie niet promoveert.
De beschikbare MCP-tools kunnen bestaande checks wijzigen, maar geen nieuwe
projectcheck aanmaken of inventariseren. Activering is dus nog niet bewezen.

Alternatief staat `.github/workflows/release.yml` klaar als handmatig te starten
workflow. Stel `VERCEL_TOKEN` als GitHub-secret en `VERCEL_ORG_ID` en
`VERCEL_PROJECT_ID` als repositoryvariabelen in. De workflow weigert zonder
succesvolle volledige CI voor de actuele main-SHA en controleert die vlak vóór
deploy nogmaals. Zij bouwt met productie-env-vars en deployt dezelfde artifact.
Gebruik hiervoor ook de Vercel CLI-skill en controleer de gepinde CLI-help.

Deze workflow alleen stopt de huidige native Git-auto-deploy niet. Schakel die
pas uit nadat de alternatieve route aantoonbaar werkt, of activeer de native
Deployment Check. Tot die activering is CI als releasevoorwaarde niet volledig
afgedwongen; maak `main` hiervoor niet openbaar en wijzig geen betaald plan.
