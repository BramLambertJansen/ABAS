# Checklist — instellingen buiten de repo (ADR 0025/0027)

Status: **goedgekeurd**

Read-only gecontroleerd op 2026-10-09. Een checkbox betekent uitgevoerd en
geverifieerd, niet alleen in git beschreven. Geen settings of productie
gewijzigd tijdens de frameworkreparatie.

## GitHub

- [x] Actions werkt weer. Volledige CI op main `8346ef5` is groen:
  [run 37834088378](https://github.com/BramLambertJansen/ABAS/actions/runs/37834088378).
- [x] Repositorymetadata gecontroleerd: ABAS is **public**, main heeft
  `protected: false`, rulesets zijn leeg. De oude private-repo/planbeperking
  is geen geldige verklaring voor deze huidige inrichting.
- [ ] Aparte agentidentiteit inrichten. Huidige koppeling is Brams adminaccount.
  Agent: Contents en Pull requests alleen waar nodig; geen Administration,
  Workflows, Checks of Commit statuses write. Geen ownercredentials in de
  agentomgeving. Accountnaam en credentialpermissies daadwerkelijk verifiëren.
- [ ] `main` beschermen volgens [main-protection.json](main-protection.json):
  PR en actuele Code Owner-review, stale approvals intrekken, `check-all`,
  `diff-guard`, `osv-scanner`, `betterleaks` verplicht, gesprekken oplossen,
  geen adminbypass/force-push/deletion. Controleer GitHub Actions als bron van
  de checks. Beperkte agentcredentials blijven nodig: dezelfde Actions-app
  kan ook een andere workflow met een gelijknamige check produceren.
- [ ] Settings toepassen met een bevoegde menselijke sessie. De huidige
  GitHub-integratie krijgt HTTP 403 op de protection-/Actions-beheer-API;
  met deze koppeling kunnen we dit niet activeren. Na verificatie van account
  en repo kan de eigenaar uitvoeren:
  `gh api --method PUT repos/BramLambertJansen/ABAS/branches/main/protection --input docs/operations/main-protection.json`.
- [ ] Na merge van de vertrouwde diff-guard: label én aangewezen onafhankelijke
  reviewer op actuele head controleren. Bram herstart de workflow op main of
  zet het label opnieuw na review. Eerste invoering handmatig reviewen; de
  oude defaultbranch-workflow controleert de reparatie-PR nog.
- [ ] Preview/Production-environments beschermen. Beide hadden geen
  protection rules. Controleer de lowercase environment `production` uit
  release.yml, beperk tot main en vereis Brams vrijgave. Geen gedeelde
  agentcredentials met deployment-/environmentbeheerrechten.
- [ ] Release-config controleren: VERCEL_TOKEN, VERCEL_ORG_ID,
  VERCEL_PROJECT_ID. Secretwaarden niet exporteren. Met deze koppeling is
  aanwezigheid/permissie van Actions-secrets niet verifieerbaar (HTTP 403).
- [ ] `SCREENSHOTS_TOKEN` beperkt tot deze repo en Contents write; zonder
  geschikte token veroorzaakt een workflowpush geen nieuwe CI-run.

Diagnose: `node scripts/kit/controleer-inrichting.mjs BramLambertJansen/ABAS`.
Deze faalt op onleesbare/ontbrekende bescherming en gedeelde adminidentiteit.
Hij bewijst geen actieve runtimehooks, environmentbeleid of tokenpermissies;
die controles blijven expliciet handmatig. Een ruleset naast branch protection
kan aanvullende regels geven en vraagt afzonderlijke inspectie.

## Secretscan

- [x] Elf historische meldingen afzonderlijk geclassificeerd; alleen exacte
  fingerprints uitgezonderd. Zie [scanmetadata](../audits/2026-10-09-secretscan.json).
  Twee geverifieerde auditchecksums, twee synthetische URL-fixtures, zes
  gemockte Auth-testfixtures en één documentatieverwijzing naar een testvariabele.
- [x] Volledige opgehaalde git-history opnieuw gescand met dezelfde gepinde
  Betterleaks 1.9.0 als CI: nul niet-uitgezonderde meldingen.
- [ ] Beveiligingsjobs verplicht maken zodra de actuele reparatie-PR groen is.
  CI publiceert alleen detector, pad, regel, commit en fingerprint. Geen
  brede detector-/paduitzondering; nieuwe vindplaatsen blijven blokkeren.

## Supabase en Vercel

- [x] Preflight 2026-10-09: hoogste migratie 0040; `caller_session_alive` en
  geldwrappers ontbreken; nul open barsessies. Metadata is een momentopname.
- [ ] Migraties 0041–0044 volgens [platformrunbook](platform-runbook.md)
  toepassen, schema-/rechtencontrole uitvoeren en daarna release van een
  geverifieerde main-SHA. Zie de concrete [uitrolvoorbereiding](review-herstel-uitrol.md).
- [ ] Herstelbare backup aantonen vóór productiewrites. Bram koos eerder
  uitsluitend voorbereiding van backupbestanden/procedure; geen automatische
  externe backup activeren zonder nieuw besluit.
- [ ] Preview krijgt eigen Supabase-project/branch of wordt uitgeschakeld.
  Nieuwe previews met productie-URL falen terecht op check:deployment.
- [ ] Na merge verifiëren dat native main-auto-deploy uit staat en een
  handmatige release volledige succesvolle CI van exact dezelfde SHA vereist.
- [ ] API-keytypen controleren en legacykeys pas daarna uitzetten.
- [ ] Na 2026-10-30 CLI-support voor `auto_expose_new_tables` herbeoordelen.

## Agent-runtimes

- [ ] Claude Code: lokaal `/hooks` en een geblokkeerde Developer-testwrite
  controleren; hooks in cloudsessies/subagents zijn niet automatisch bewezen.
- [x] Codex: AGENTS.md toegevoegd met rolverdeling, verificatie en
  goedkeuringsgrenzen. Dit activeert geen Claude-toolhooks in Codex.
- [ ] Starterapp: installatie op verse clone inclusief identiteit, externe
  bescherming, lokale stack en daadwerkelijk geladen hooks bewijzen.
