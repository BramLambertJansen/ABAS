#!/usr/bin/env node
// Groen vóór klaar — SubagentStop-hook voor developer en tester (ADR 0025).
//
// Een subagent die bestanden wijzigde, is pas klaar als `npm run check:fast`
// groen is. Rood → {"decision":"block"} met de staart van de uitvoer als
// reden; Claude Code begrenst dit tot 5 opeenvolgende blokkades per beurt.
// Ook een schone werkboom wordt gecontroleerd: een commit is geen bewijs
// dat de pre-commit hook daadwerkelijk draaide.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const inp = JSON.parse(readFileSync(0, "utf8") || "{}");
const cwd = process.env.CLAUDE_PROJECT_DIR || inp.cwd || process.cwd();

const run = spawnSync("npm", ["run", "check:fast"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (run.status === 0) process.exit(0);

const staart = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason:
      "check:fast is rood; je bent niet klaar. Fix de bron (niet de test of de gate) en stop daarna opnieuw.\n\n" +
      staart,
  }),
);
process.exit(0);
