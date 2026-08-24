# Voorraadbeheer afschaffen

_Started 2026-08-04 07:58 UTC_

---

## User

Voorraadbeheer hoeft niet meer en mag eruit

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Voorraadbeheer is eruit: geen voorraadbadges op het verkoopscherm, geen voorraadkaart/levering/afboeken in het productpaneel, geen min-max, en "Aandacht" toont nu alleen lage saldo's. Het assortimentsfilter houdt nog wel Alle/Archief, en het logboekfilter "Voorraad" heet nu "Assortiment" (prijs- en productwijzigingen).

## User

Found issues — fixing…

## Assistant

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Ontbrekende `const manageProduct = {` hersteld — de logica draait weer.

