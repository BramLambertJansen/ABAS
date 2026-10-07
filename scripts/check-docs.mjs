#!/usr/bin/env node
// check:docs — documentatie die agents sturen, mag niet liegen over de repo
// (ADR 0025). Vijf regels:
//   1. elke ADR begint met `Status: **woord**` uit de vaste woordenlijst, en
//      de titel noemt het eigen nummer;
//   2. een spec met een statusregel gebruikt dezelfde woordenlijst; een spec
//      op `goedgekeurd` heeft de sectie "Hergebruik & UX-patronen"; specs
//      zonder statusregel staan in de ratchet (nieuwe specs hebben er één);
//   3. backtick-identifiers in CLAUDE.md, .claude/agents, .claude/rules en
//      .claude/skills bestaan: paden op schijf, npm-scripts in package.json,
//      snake_case-namen in supabase/, camelCase-namen in src/. Een alinea die
//      begint met "Besloten maar nog niet gebouwd" telt niet mee;
//   4. het gateregister (scripts/kit/gates.mjs) en `check:all` noemen
//      dezelfde scripts;
//   5. elk component in src/components heeft een rij in de README.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { GATES } from "./kit/gates.mjs";
import { componenten } from "./kit/catalogus.mjs";
import { ratchet } from "./kit/ratchet.mjs";

const root = process.cwd();
const lees = (p) => readFileSync(path.join(root, p), "utf8");
const problems = [];
const STATUS = ["voorstel", "goedgekeurd", "gebouwd", "vervallen"];
const statusVan = (tekst) => /^Status:\s*\*\*(\p{L}+)\*\*/mu.exec(tekst)?.[1];

// 1. ADR's
const adrs = readdirSync(path.join(root, "docs/adr")).filter((f) => f.endsWith(".md"));
for (const f of adrs) {
  const tekst = lees(`docs/adr/${f}`);
  const s = statusVan(tekst);
  if (!s || !STATUS.includes(s)) {
    problems.push(`docs/adr/${f}: eerste statusregel moet "Status: **${STATUS.join("|")}**" zijn (gevonden: ${s ?? "geen"})`);
  }
  const nummer = f.slice(0, 4);
  const titel = /^#\s+(.*)$/m.exec(tekst)?.[1] ?? "";
  if (!titel.includes(nummer)) problems.push(`docs/adr/${f}: titel "${titel}" noemt nummer ${nummer} niet`);
}

// 2. Specs
const specs = readdirSync(path.join(root, "docs/features")).filter((f) => f.endsWith(".md"));
const zonderStatus = [];
for (const f of specs) {
  const tekst = lees(`docs/features/${f}`);
  const s = statusVan(tekst);
  if (!s) {
    zonderStatus.push(`docs/features/${f}`);
    continue;
  }
  if (!STATUS.includes(s)) problems.push(`docs/features/${f}: status "${s}" niet in ${STATUS.join("|")}`);
  if (s === "goedgekeurd" && !/^##\s+Hergebruik & UX-patronen\s*$/m.test(tekst)) {
    problems.push(`docs/features/${f}: goedgekeurde spec mist "## Hergebruik & UX-patronen" (skill /spec)`);
  }
}
problems.push(...ratchet("spec-zonder-status", zonderStatus, "spec zonder `Status: **woord**`-regel — voeg hem toe (skill /spec)"));

// 3. Backtick-identifiers
const pkg = JSON.parse(lees("package.json"));
function bestanden(dir, re) {
  if (!existsSync(path.join(root, dir))) return [];
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (["node_modules", ".next", ".git"].includes(f)) return [];
    return statSync(path.join(root, rel)).isDirectory() ? bestanden(rel, re) : re.test(f) ? [rel] : [];
  });
}
const supabaseTekst = [...bestanden("supabase", /\.(sql|toml)$/)].map(lees).join("\n");
const srcTekst = bestanden("src", /\.(ts|tsx)$/).map(lees).join("\n");
const bronnen = ["CLAUDE.md", ...bestanden(".claude/agents", /\.md$/), ...bestanden(".claude/rules", /\.md$/), ...bestanden(".claude/skills", /\.md$/)];

function controleer(id) {
  const kaal = id.replace(/\(\)$/, "").trim();
  if (/[<>*{}…\s]|NNNN|\.\.\./.test(kaal) && !/^npm run /.test(kaal)) return null; // sjabloon, glob of zin
  const script = /^npm run ([\w:-]+)$/.exec(kaal)?.[1] ?? (/^(check|db|test|lint|ratchet):[\w:-]+$/.test(kaal) ? kaal : null);
  if (script) return pkg.scripts[script] ? null : `npm-script "${script}" bestaat niet in package.json`;
  if (/^node scripts\//.test(kaal)) {
    const p = kaal.split(/\s+/)[1];
    return existsSync(path.join(root, p)) ? null : `${p} bestaat niet`;
  }
  if (/^\.?[\w@.-]+(\/[\w@.()[\]-]*)+\/?$|^[\w.-]+\.(md|ts|tsx|mjs|json|sql|toml)$/.test(kaal)) {
    const p = kaal.replace(/^\//, "");
    if (existsSync(path.join(root, p))) return null;
    if (/^src\/.*\.tsx?$/.test(p) === false && !p.includes("/") && bestanden(".", new RegExp(`^${p.replace(/\./g, "\\.")}$`)).length) return null;
    return `pad ${kaal} bestaat niet`;
  }
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(kaal)) {
    return new RegExp(`\\b${kaal}\\b`).test(supabaseTekst) ? null : `${kaal} komt niet voor in supabase/`;
  }
  if (/^(use|is|get|set|run|format|parse|report|log)[A-Z]\w*$/.test(kaal)) {
    return new RegExp(`\\b${kaal}\\b`).test(srcTekst) ? null : `${kaal} komt niet voor in src/`;
  }
  return null;
}

for (const bron of bronnen) {
  const tekst = lees(bron)
    .replace(/^Besloten maar nog niet gebouwd[\s\S]*?(?:\n[ \t]*\n|(?![\s\S]))/gm, "\n")
    .replace(/```[\s\S]*?```/g, "");
  for (const m of tekst.matchAll(/`([^`\n]+)`/g)) {
    const fout = controleer(m[1]);
    if (fout) problems.push(`${bron}: \`${m[1]}\` — ${fout}`);
  }
}

// 4. Gateregister ↔ check:all
const uitklappen = (naam, gezien = new Set()) => {
  if (gezien.has(naam)) return [];
  gezien.add(naam);
  const cmd = pkg.scripts[naam] ?? "";
  const subs = [...cmd.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
  return subs.length ? subs.flatMap((s) => uitklappen(s, gezien)) : [naam];
};
const inCheckAll = new Set(uitklappen("check:all"));
const inRegister = new Set(GATES.map((g) => g.script));
for (const s of inCheckAll) if (!inRegister.has(s)) problems.push(`check:all draait ${s}, maar scripts/kit/gates.mjs beschrijft het niet`);
for (const s of inRegister) if (!inCheckAll.has(s)) problems.push(`scripts/kit/gates.mjs noemt ${s}, maar check:all draait het niet`);
const inCheckFast = new Set(uitklappen("check:fast"));
for (const g of GATES) {
  if (g.snel && !inCheckFast.has(g.script)) problems.push(`${g.script} is snel (gates.mjs) maar staat niet in check:fast`);
  if (!g.snel && inCheckFast.has(g.script)) problems.push(`${g.script} staat in check:fast maar is niet snel volgens gates.mjs`);
}

// 5. Componentcatalogus
for (const c of componenten()) {
  if (!c.rij) problems.push(`${c.rel}: geen rij in src/components/README.md (skill /nieuw-component)`);
}

if (problems.length) {
  console.error("check:docs: FAIL");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check:docs: ok (${adrs.length} ADR's, ${specs.length} specs, ${bronnen.length} stuurbestanden)`);
