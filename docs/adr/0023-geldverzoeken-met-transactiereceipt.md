# ADR 0023 — Geldverzoeken met een transactiereceipt

Status: geaccepteerd door Bram op 2026-10-05; implementatie wacht op volledige CI.

## Context

Een verloren HTTP-antwoord bewijst niet dat een financiële mutatie is mislukt.
Zie de goedgekeurde spec [geldverzoeken-idempotent](../features/geldverzoeken-idempotent.md).

## Besluit

Additieve `*_once`-RPC's accepteren een UUID en roepen de bestaande geld-RPC's
aan. Een interne RLS-tabel bewaart actor, operatie, parameterhash en resultaat.
Een transactielock per UUID serialiseert aanvragen. Mutatie en receipt committen
samen; een fout rolt beide terug. Een primaire sleutel voorkomt dubbele receipts.
Elke retry doorloopt sessie- en attributieguards voordat een resultaat terugkomt.
Een parameter-, actor- of operatieconflict geeft `request_id_conflict`.

De browser bewaart de UUID en invoer per actor en operatie vóór verzending.
Een onbekende uitkomst of sessiefout wist die niet, ook niet bij reset of herladen.
Een bevestigde boeking of bevestigde domeinafwijzing beëindigt die intent.
Web Locks beschermen deze opslag tegen gelijktijdige tabbladen; ontbrekende
opslag/locks blokkeert een geldverzoek. De server blijft de financiële waarheid.

Receipts verlopen niet automatisch. Startsaldo blijft op de ledenrij, zonder
nieuwe logboekregel. Oude RPC's blijven tijdens de compatibele uitrol bestaan;
oude appversies krijgen daardoor nog niet de nieuwe retrygarantie.

## Gevolgen

Ontbrekende responses blokkeren gewijzigde invoer totdat de oorspronkelijke
actie met dezelfde invoer is afgehandeld. Geen automatische nieuwe boeking na
inloggen. SQL-, concurrency- en clienttests bewaken precies één mutatie en
weigering van conflicten. Productie volgt pas na volledige CI en review.
