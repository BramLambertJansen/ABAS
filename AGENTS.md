# ABAS — instructies voor Codex en andere agents

Lees `CLAUDE.md`, `docs/ARCHITECTURE.md` en de relevante goedgekeurde
feature-spec vóór implementatie. `node scripts/kit/feiten.mjs` toont de gates.
Zoek bestaande componenten en hooks voordat je nieuwe abstraheert.

Volg de rolverdeling uit `.claude/agents/`. Een Developer schrijft geen gates
of tests; een Tester schrijft alleen de vier testmappen uit
`.claude/hooks/rolhek.lokaal.json`. De hoofdsessie kan een expliciet
opgedragen frameworkreparatie uitvoeren; gate- en bestaande-testwijzigingen
vragen daarna onafhankelijke menselijke review op de actuele PR-head.

Draai `npm run check:fast` en passende langzame verificatie. Omzeil pre-commit
niet. Zet geen gate-goedkeuringslabel, review of succesvolle checkstatus zelf.
Open na de eerste push direct een PR. Bram reviewt en merget. Productie volgt
`docs/operations/platform-runbook.md`; een lokale groene build is geen
productie-uitrolbewijs.

De Claude-toolhooks zijn hier niet automatisch actief. Deze instructies zijn
werkafspraken; GitHub-bescherming en afzonderlijke beperkte agentcredentials
zijn de echte grens. Controleer de externe inrichting met
`node scripts/kit/controleer-inrichting.mjs BramLambertJansen/ABAS` en de
rails-checklist. Claim nooit dat onleesbare instellingen correct zijn.
