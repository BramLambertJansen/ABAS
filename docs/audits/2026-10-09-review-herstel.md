# Verwerking ABAS-frameworkreview — 2026-10-09

Uitgangspunt: main `8346ef5e50825576117d57a1bd0947fff095ee2d`.
Opdracht: het reviewrapport verwerken. Geen merge of productiemutatie.

| Bevinding | Herstel | Externe restactie |
| --- | --- | --- |
| F1 main onbeschermd | Read-only installatiediagnose en toepasbare protection-config | Eigenaar activeert bescherming; huidige integratie HTTP 403 |
| F2 label/self-review | Label plus aangewezen onafhankelijke review op exacte SHA; CODEOWNERS uitgebreid | Aparte beperkte author-identiteit nodig; agent gebruikt nu eigenaaraccount |
| F3 mutable workflow | pull_request_target/defaultbranch, geen PR-code uitvoeren; status op PR-head | Eerste invoering door Bram reviewen; agent mag geen Workflows/Checks/Statuses write hebben |
| F4 testpaden | Eén testpadenconfig voor alle vier suites en Developer-hek | Runtimehooks daadwerkelijk laden en controleren |
| F5 import/queryomwegen | Opgeloste imports, transitieve client-re-exports, AST voor propertycalls; parser zelf beschermd | Bronanalyse blijft een gate, geen sandbox voor willekeurige code |
| F6 hooks omzeilen | core.hooksPath/HUSKY/no-verify geblokkeerd; ook schone boom controleren; claims gecorrigeerd | Serverchecks en beperkte credentials blijven vereist |
| F7 productie achter | Hashes, doelproject, volgorde en preflight in uitrolvoorbereiding; contract vereist sessieguard | Backup, 0041–0044, verificatie en release door eigenaar |
| F8 oude leesresultaten | Bestaande rondeguard in zeven kwetsbare hooks, inclusief succes/fout/unmount | Geen |
| F9 scan rood | Elf geclassificeerde historische fingerprints; geredigeerde metadata in CI | Actuele beveiligingsjobs verplicht maken na groene scan |

## Verificatie

- `check:fast` en Next-productiebuild lokaal gecontroleerd.
- Gerichte regressies: alle vier testmappen, Unicode/rename/delete-diffs,
  review-SHA/self-review/dismissal, shelloverrides, imports/re-exports en
  bracket-/variabelequeries. Echte zeven query-hooks met gecontroleerde
  antwoorden, late fouten, unmount en zichtbare actuele fouten.
- actionlint 1.7.11: gewijzigde workflows geldig.
- Betterleaks 1.9.0, identieke CI-image/digest: volledige opgehaalde history
  heeft nul niet-uitgezonderde meldingen. Geen secretwaarden gepubliceerd.
  Details: [scanmetadata](2026-10-09-secretscan.json).
- Volledige database-/Auth-/browserverificatie volgt in CI op de PR-commit;
  de bestaande groene main-run geldt niet als bewijs voor deze wijzigingen.

## Nog noodzakelijk

[Rails-checklist](../operations/rails-checklist.md) bevat de actuele externe
status en [uitrolvoorbereiding](../operations/review-herstel-uitrol.md) de
concrete productiehandelingen. Supabasepreflight: 0040, ontbrekende sessieguard
/geldwrappers, nul open barsessies. Dat is een momentopname, geen releasebewijs.

Bram kan een onder zijn eigen account geopende PR niet zelf approven.
Dit is een bootstrapbeperking, geen reden om eigenaarbypass in te schakelen.
GitHub-reviewmetadata onderscheidt geen mens van een agent met hetzelfde
account. Credentials beperken en bescherming activeren hoort daarom vóór
starterapp-extractie; uitsluitend deze bestanden kopiëren voltooit dat niet.
