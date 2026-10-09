#!/usr/bin/env node
// kit: generiek
// check:axe — axe-uitzonderingen tellen (docs/features/scan-axe.md).
// Elke `scanAxe(…)`-aanroep onder `e2e/` mag regels uitzetten (`uitgezet`) of
// gebieden overslaan (`overslaan`), maar alleen letterlijk en met een reden;
// het aantal staat in de ratchet (.kit/baseline.json → axe-uitzondering) en
// mag alleen dalen. Parset met de TypeScript-compiler-API, geen regex.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { ratchet } from "./ratchet.mjs";

export const REGEL = "axe-uitzondering";
const MAP = "e2e";
const OVERSLAAN = new Set(["e2e/helpers/scanAxe.ts", "e2e/scan-axe.spec.ts"]);
const SOORTEN = { uitgezet: "regel", overslaan: "selector" };

const isTekst = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

function eigenschap(obj, naam) {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && p.name.getText() === naam) return p.initializer;
  }
  return undefined;
}

/**
 * Sleutels en problemen voor één bestand.
 * @returns {{ sleutels: string[], problemen: string[] }}
 */
export function analyseerBestand(pad, tekst) {
  const bron = ts.createSourceFile(pad, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sleutels = [];
  const problemen = [];
  const teller = new Map();
  const letterlijk = (node) => {
    const regel = bron.getLineAndCharacterOfPosition(node.getStart(bron)).line + 1;
    problemen.push(`${pad}:${regel}: scanAxe-opties moeten letterlijk zijn (object, array en strings), zodat check:axe uitzonderingen kan tellen`);
  };

  // Ook een hernoemde import (`import { scanAxe as s }`) en `x.scanAxe(…)`.
  const namen = new Set(["scanAxe"]);
  for (const stelling of bron.statements) {
    const binding = ts.isImportDeclaration(stelling) ? stelling.importClause?.namedBindings : undefined;
    if (binding && ts.isNamedImports(binding)) {
      for (const el of binding.elements) if ((el.propertyName ?? el.name).text === "scanAxe") namen.add(el.name.text);
    }
  }
  const isScanAxe = (callee) =>
    (ts.isIdentifier(callee) && namen.has(callee.text)) || (ts.isPropertyAccessExpression(callee) && callee.name.text === "scanAxe");

  const bezoek = (node) => {
    if (ts.isCallExpression(node) && isScanAxe(node.expression)) {
      const opties = node.arguments[1];
      if (opties !== undefined) {
        if (!ts.isObjectLiteralExpression(opties)) letterlijk(opties);
        else {
          // Alleen `naam: waarde`: geen spread, shorthand, getter, methode of berekende sleutel.
          if (opties.properties.some((p) => !ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name))) letterlijk(opties);
          for (const [soort, veld] of Object.entries(SOORTEN)) {
            const lijst = eigenschap(opties, soort);
            if (lijst === undefined) continue;
            if (!ts.isArrayLiteralExpression(lijst)) {
              letterlijk(lijst);
              continue;
            }
            for (const item of lijst.elements) {
              const waarde = ts.isObjectLiteralExpression(item) ? eigenschap(item, veld) : undefined;
              const reden = ts.isObjectLiteralExpression(item) ? eigenschap(item, "reden") : undefined;
              if (waarde === undefined || reden === undefined || !isTekst(waarde) || !isTekst(reden) || reden.text.trim() === "") {
                letterlijk(item);
                continue;
              }
              const basis = `${pad} ${soort}:${waarde.text}`;
              const n = (teller.get(basis) ?? 0) + 1;
              teller.set(basis, n);
              sleutels.push(n === 1 ? basis : `${basis} #${n}`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, bezoek);
  };
  bezoek(bron);
  return { sleutels, problemen };
}

function bestanden(root, dir) {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    return statSync(path.join(root, rel)).isDirectory() ? bestanden(root, rel) : /\.(?:[cm]?[jt]s|tsx|jsx)$/.test(f) ? [rel] : [];
  });
}

export function draai(root = path.resolve(import.meta.dirname, "../..")) {
  const sleutels = [];
  const problemen = [];
  for (const rel of bestanden(root, MAP).sort()) {
    if (OVERSLAAN.has(rel)) continue;
    const r = analyseerBestand(rel, readFileSync(path.join(root, rel), "utf8"));
    sleutels.push(...r.sleutels);
    problemen.push(...r.problemen);
  }
  problemen.push(
    ...ratchet(
      REGEL,
      sleutels,
      "nieuwe axe-uitzondering — los de violation op in src/ in plaats van de regel uit te zetten; alleen Bram kan hem toevoegen aan .kit/baseline.json → axe-uitzondering (label gate-wijziging)",
      path.join(root, ".kit/baseline.json"),
    ),
  );
  return problemen;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const problemen = draai();
  if (problemen.length) {
    console.error(`check:axe: ${problemen.length} ${problemen.length === 1 ? "probleem" : "problemen"}\n- ${problemen.join("\n- ")}`);
    process.exit(1);
  }
  console.log("check:axe: ok");
}
