import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { RATE_LIMITED_MESSAGE } from "../src/lib/authErrors.ts";

/**
 * #73 — acceptatiecriterium: de rate-limit-tekst staat alleen in
 * src/lib/authErrors.ts; elk scherm dat hem toont importeert
 * RATE_LIMITED_MESSAGE. Een losse kopie elders in src/ loopt bij de eerste
 * tekstwijziging uit de pas (zo ontstond #73). Dat de uitnodigingsfout in
 * LidBeherenOverlay de tekst daadwerkelijk toont, staat in
 * e2e/ledenbeheer-invite.spec.ts.
 */

const SRC = new URL("../src/", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test("RATE_LIMITED_MESSAGE staat letterlijk alleen in src/lib/authErrors.ts", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length > 0, "geen bronbestanden gevonden onder src/");

  const withLiteral = files
    .filter((file) => readFileSync(file, "utf8").includes(RATE_LIMITED_MESSAGE))
    .map((file) => relative(SRC, file));

  assert.deepEqual(withLiteral, ["lib/authErrors.ts"]);
});

test("ook de kern van de tekst ('te veel pogingen') komt nergens anders als string voor", () => {
  // Vangt een kopie met een net andere staart (bv. een ander streepje),
  // die de exacte vergelijking hierboven zou missen. Commentaar telt niet
  // mee: useWachtwoordHerstellen.ts noemt de melding in uitleg.
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.endsWith(join("lib", "authErrors.ts")))
    .filter((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .some((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
            return false;
          }
          return /["'`][^"'`]*te veel pogingen/i.test(line);
        })
    )
    .map((file) => relative(SRC, file));

  assert.deepEqual(offenders, []);
});
