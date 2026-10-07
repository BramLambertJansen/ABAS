#!/usr/bin/env node
// Catalogus — wat er al is in src/components en src/hooks, zodat "zoek eerst"
// niet van het geheugen van een agent afhangt (ADR 0025).
// `node scripts/kit/catalogus.mjs [componenten|hooks]` (zonder argument: beide).
// `--ontbrekend` print alleen componenten zonder rij in src/components/README.md
// (gebruikt door de ratchet).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const deel = process.argv.slice(2).find((a) => !a.startsWith("--"));
const alleenOntbrekend = process.argv.includes("--ontbrekend");

function bestanden(dir, filter) {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    return statSync(path.join(root, rel)).isDirectory() ? bestanden(rel, filter) : filter(f) ? [rel] : [];
  });
}
const exportsVan = (tekst) =>
  [...tekst.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface)\s+(\w+)/gm)].map((m) => m[1]);

export function componenten() {
  const readme = readFileSync(path.join(root, "src/components/README.md"), "utf8");
  const rijen = readme.split("\n").filter((r) => r.startsWith("|"));
  return bestanden("src/components", (f) => /\.tsx?$/.test(f)).map((rel) => {
    const tekst = readFileSync(path.join(root, rel), "utf8");
    const naam = path.basename(rel).replace(/\.tsx?$/, "");
    const exp = exportsVan(tekst);
    const rij = rijen.find((r) => [naam, ...exp].some((e) => r.includes(`\`${e}\``)));
    return { rel, naam, exports: exp, rij: rij ? rij.split("|").slice(1, -1).map((c) => c.trim()) : null };
  });
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  if (alleenOntbrekend) {
    for (const c of componenten()) if (!c.rij) console.log(c.rel);
  } else {

  const uit = [];
  if (!deel || deel === "componenten") {
    uit.push("## Componenten (src/components) — kies hieruit vóór je iets nieuws maakt\n");
    for (const c of componenten()) {
      uit.push(`- \`${c.rel}\` — exports: ${c.exports.join(", ") || "—"}`);
      if (c.rij) uit.push(`  taak: ${c.rij[0]}; ${c.rij[2] ?? ""}`);
      else uit.push("  ⚠ geen rij in src/components/README.md");
    }
  }
  if (!deel || deel === "hooks") {
    uit.push("\n## Hooks (src/hooks)\n");
    for (const rel of bestanden("src/hooks", (f) => /\.ts$/.test(f))) {
      const tekst = readFileSync(path.join(root, rel), "utf8");
      const rpc = [...new Set([...tekst.matchAll(/\.rpc\(\s*["'](\w+)["']/g)].map((m) => m[1]))];
      const from = [...new Set([...tekst.matchAll(/\.from\(\s*["'](\w+)["']/g)].map((m) => m[1]))];
      const bron = [rpc.length ? `rpc: ${rpc.join(", ")}` : "", from.length ? `from: ${from.join(", ")}` : ""].filter(Boolean).join("; ");
      uit.push(`- \`${rel}\` — ${exportsVan(tekst).join(", ") || "—"}${bron ? ` (${bron})` : ""}`);
    }
  }
  console.log(uit.join("\n"));
  }
}
