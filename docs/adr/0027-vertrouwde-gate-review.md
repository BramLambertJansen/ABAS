# ADR 0027 — Vertrouwde bewaker en onafhankelijke gate-review

Status: **gebouwd**

## Context

De frameworkreview van 2026-10-09 vond dat een PR zijn workflow kon wijzigen,
een label zelf kon zetten en bestaande tests buiten het Developer-hek kon
schrijven. Lokale hooks zijn hulpmiddelen; zij kunnen willekeurige
shellcode en externe API-aanroepen niet betrouwbaar isoleren.
Bram gaf opdracht het reviewrapport te verwerken.

## Besluit

1. De diff-guard draait met `pull_request_target` uitsluitend code en config
   van de defaultbranch. PR-code wordt alleen als git-data gelezen, nooit
   uitgecheckt of uitgevoerd. Het resultaat wordt op de gecontroleerde
   PR-head gepubliceerd als commitstatus `diff-guard`.
2. Gatewijzigingen en wijzigingen/verwijderingen/renames van bestaande tests
   vragen zowel `gate-wijziging` als een `APPROVED` review van een aangewezen
   reviewer op de exacte head-SHA. De auteur kan zichzelf niet goedkeuren.
   De laatste beslissende review per reviewer telt. Nieuwe tests mogen zonder
   dit akkoord; de Tester blijft de schrijver van tests.
3. Na review start Bram de workflow opnieuw op main of zet hij het label
   opnieuw. Een nieuwe commit vereist een nieuwe goedkeuring.
4. Lokale hooks blokkeren gangbare hook-omzeilingen en zelfgoedkeuring.
   `groen-voor-klaar` controleert ook een schone werkboom. Codex leest
   `AGENTS.md`; Claude-hooks gelden daar niet automatisch.
5. Voor daadwerkelijke scheiding gebruikt een agent een eigen identiteit met
   minimale repositoryrechten. Geen administratie-, workflows-, statuses- of
   checks-schrijfpermission. Geen eigenaarcredentials beschikbaar stellen.
   `main` vereist PR, Code Owner-review, actuele verplichte checks en geen
   administratorbypass. Zie de inrichting en beperkingen in de checklist.

## Gevolgen en grenzen

De eerste invoering moet Bram zelf reviewen: de oude workflow beoordeelt
nog deze PR. Een PR aangemaakt onder Brams account kan Bram niet zelf
approven. Een afzonderlijke author-identiteit moet eerst ingericht worden;
geen eigenaarbypass toevoegen om dat te omzeilen.

GitHub API-reviewmetadata bewijst geen menselijke bediening van een gedeeld
account. Een branchcheck van de GitHub Actions-app bewijst evenmin de herkomst
van elke workflow als een aanvaller workflows mag toevoegen met dezelfde
checknaam. Beperk daarom agentcredentials zoals hierboven. Bij een sterker
bedreigingsmodel zijn organisatie-required workflows of een aparte trusted
check-app nodig. Dit raamwerk is geen sandbox voor willekeurige agentcode.
