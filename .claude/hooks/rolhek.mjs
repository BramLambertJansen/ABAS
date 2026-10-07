#!/usr/bin/env node
// Rolhek — PreToolUse-hook voor elke rol uit .claude/agents/ (ADR 0025).
//
// Exit 2 blokkeert de toolaanroep; stderr gaat als reden terug naar de agent.
// Een hook-exit 2 wint van een allow-regel. De hook is een vangnet, geen
// beveiligingsgrens: de echte grens voor merge en gate-integriteit ligt bij
// GitHub (branch protection, verplichte checks, CODEOWNERS, diff-guard).
//
// Generiek deel (raamwerk). Repo-specifieke paden staan in rolhek.lokaal.json.
// Snel en offline houden: een timeout laat de actie door ("fails open").
//
// Rolnamen: de `name` uit .claude/agents/*.md. De hoofdsessie (geen
// agent_type) heeft geen schrijfbeperking: die legt verantwoording af via de
// PR, en een gate-wijziging vraagt daar het label gate-wijziging.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lokaal = JSON.parse(readFileSync(path.join(hier, "rolhek.lokaal.json"), "utf8"));
const GATES = lokaal.gates.map((r) => new RegExp(r));
const SCHRIJFRECHT = Object.fromEntries(
  Object.entries(lokaal.schrijfrecht).map(([rol, lijst]) => [rol, lijst && lijst.map((r) => new RegExp(r))]),
);

const inp = JSON.parse(readFileSync(0, "utf8") || "{}");
// Hoofdsessie heeft geen agent_type; plugin-agents komen als plugin:<p>:<naam>.
const rol = String(inp.agent_type ?? "hoofd").replace(/^plugin:[^:]+:/, "");
const tool = inp.tool_name ?? "";
const ti = inp.tool_input ?? {};
const root = process.env.CLAUDE_PROJECT_DIR || inp.cwd || process.cwd();

function weiger(melding) {
  process.stderr.write(`rolhek: ${melding}\n`);
  process.exit(2);
}
const isGate = (rel) => GATES.some((r) => r.test(rel));
const relatief = (p) => path.relative(root, path.resolve(inp.cwd || root, p)).split(path.sep).join("/");

function controleerPad(rel) {
  if (rel.startsWith("..")) return; // buiten de repo (scratchpad e.d.): niet ons hek
  const toegestaan = SCHRIJFRECHT[rol];
  if (toegestaan && !toegestaan.some((r) => r.test(rel))) {
    weiger(`rol ${rol} mag ${rel} niet schrijven. Toegestaan: ${toegestaan.map(String).join(", ") || "niets"}.`);
  }
  if (rol === "developer" && isGate(rel)) {
    weiger(
      `${rel} is een gate of test en read-only voor de Developer. Fix de bron, niet de test; ` +
        `een gate-wijziging vraag je aan Bram (PR-label gate-wijziging).`,
    );
  }
}

const bestand = ti.file_path ?? ti.notebook_path;
if (bestand) controleerPad(relatief(bestand));

if (tool === "Bash") {
  const cmd = String(ti.command ?? "");
  // Voor iedereen, ook de hoofdsessie: de pre-commit hook niet omzeilen.
  // Alleen als echt argument van git commit/push of als env-prefix, niet als tekst in een string.
  const zonderStrings = cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");
  if (/(^|[;&|]\s*)HUSKY=0\s|\bgit\s+(commit|push|merge)\b[^;&|]*\s(--no-verify|-n)(\s|$)/.test(zonderStrings)) {
    weiger("de pre-commit hook (check:fast) omzeilen mag niet. Maak check:fast groen.");
  }
  if (rol !== "hoofd") {
    if (/\bgit\b[^;&|]*\b(push|merge|rebase|reset\s+--hard)\b|\bgh\s+pr\s+(merge|close)\b/.test(cmd)) {
      weiger(`alleen de hoofdsessie pusht, merget of herschrijft history (rol ${rol}).`);
    }
    // Tekstmatch op schrijvende shellcommando's: redirect-doelen en de
    // padargumenten van sed -i/tee/mv/cp/rm/git checkout|restore. Vangt de
    // gewone vorm, niet elke omweg (bash -c, node -e): dat vangt de CI-diff-guard.
    for (const rel of schrijfdoelen(cmd)) controleerPad(rel);
  }
}

function schrijfdoelen(cmd) {
  const doelen = [];
  for (const m of cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''").matchAll(/(?:^|[^0-9&>])>{1,2}\s*([^\s;&|<>]+)/g)) doelen.push(m[1]);
  for (const segment of cmd.split(/&&|\|\||[;|\n]/)) {
    const woorden = segment.trim().split(/\s+/);
    const i = woorden.findIndex((w) => !/^\w+=/.test(w)); // sla VAR=x prefixen over
    const verb = woorden[i];
    const schrijvend =
      (verb === "sed" && woorden.some((w) => /^-i/.test(w))) ||
      ["tee", "mv", "cp", "rm", "truncate", "touch"].includes(verb) ||
      (verb === "git" && ["checkout", "restore", "rm", "mv"].includes(woorden[i + 1]));
    if (!schrijvend) continue;
    for (const w of woorden.slice(i + 1)) if (!w.startsWith("-") && /[/.]/.test(w)) doelen.push(w.replace(/^['"]|['"]$/g, ""));
  }
  // Alleen padvormige woorden waarvan de map bestaat: zo telt een sed-expressie
  // als 's/a/b/' of een pijl uit `node -e` niet als schrijfdoel.
  return doelen
    .filter((d) => /^[\w@~./-]+$/.test(d) && /[/.]/.test(d) && !d.startsWith("/dev/"))
    .filter((d) => existsSync(path.dirname(path.resolve(inp.cwd || root, d))))
    .map(relatief)
    .filter((rel) => rel !== "" && !rel.startsWith(".."));
}
process.exit(0);
