// Rolhek (.claude/hooks/rolhek.mjs, ADR 0025): de hook is zelf een gate, dus
// zonder test is hij een aanname. Elke rij is een toolaanroep zoals Claude Code
// hem op stdin aanbiedt, met de verwachte exitcode (0 = door, 2 = geblokkeerd).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const hook = path.join(root, ".claude/hooks/rolhek.mjs");

type Geval = [naam: string, rol: string | null, tool: string, input: Record<string, string>, exit: 0 | 2];

const gevallen: Geval[] = [
  ["developer schrijft geen test-test", "developer", "Write", { file_path: "test/x.test.ts" }, 2],
  ["developer schrijft geen e2e-test", "developer", "Write", { file_path: "e2e/x.test.ts" }, 2],
  ["developer schrijft geen integration-test", "developer", "Write", { file_path: "integration/x.test.ts" }, 2],
  ["hoofdsessie: hooksPath override", null, "Bash", { command: "git -c core.hooksPath=/dev/null commit -m x" }, 2],
  ["hoofdsessie: hooksPath config", null, "Bash", { command: "git config core.hooksPath /dev/null" }, 2],
  ["hoofdsessie: hooksPath lezen", null, "Bash", { command: "git config --get core.hooksPath" }, 0],
  ["hoofdsessie: label toekennen", null, "Bash", { command: "gh pr edit 1 --add-label gate-wijziging" }, 2],
  ["hoofdsessie: review toekennen", null, "Bash", { command: "gh api repos/a/b/pulls/1/reviews -f event=APPROVE" }, 2],
  ["hoofdsessie: label lezen", null, "Bash", { command: "gh api repos/a/b/issues/1/labels" }, 0],
  ["developer schrijft geen gate", "developer", "Edit", { file_path: `${root}/scripts/check-rls.mjs` }, 2],
  ["developer schrijft geen pgTAP-test", "developer", "Write", { file_path: "supabase/tests/x.test.sql" }, 2],
  ["developer schrijft bron", "developer", "Edit", { file_path: `${root}/src/lib/money.ts` }, 0],
  ["developer pusht niet", "developer", "Bash", { command: "git -C . push origin main" }, 2],
  ["developer omzeilt gate niet via sed", "developer", "Bash", { command: "sed -i 's/a/b/' scripts/check-rls.mjs" }, 2],
  ["reviewer leest en draait checks", "reviewer", "Bash", { command: "npm run check:all 2>&1 | tail -5; cat src/lib/money.ts > /tmp/x; node -e 'a.map(x => x)'" }, 0],
  ["reviewer merget niet", "reviewer", "Bash", { command: "gh pr merge 12" }, 2],
  ["reviewer schrijft niets", "reviewer", "Write", { file_path: "docs/x.md" }, 2],
  ["tester schrijft testpad met sed", "tester", "Bash", { command: "sed -i 's/a/b/' test/money.test.ts" }, 0],
  ["tester schrijft geen bron", "tester", "Bash", { command: "echo x > src/lib/money.ts" }, 2],
  ["tester schrijft geen bron via een gequote pad", "tester", "Bash", { command: 'echo x > "src/lib/money.ts"' }, 2],
  ["developer wijzigt geen gate-script in package.json", "developer", "Edit", { file_path: `${root}/package.json`, old_string: '"test": "node --test', new_string: '"test": "true || node --test' }, 2],
  ["developer mag dependencies in package.json wijzigen", "developer", "Edit", { file_path: `${root}/package.json`, old_string: '"private": true', new_string: '"private": true ' }, 0],
  ["developer schrijft package.json niet via de shell", "developer", "Bash", { command: "sed -i 's/a/b/' package.json" }, 2],
  ["architect schrijft ADR (plugin-naam)", "plugin:kit:architect", "Write", { file_path: "docs/adr/0099-x.md" }, 0],
  ["architect schrijft geen code", "architect", "Write", { file_path: "src/x.ts" }, 2],
  ["docs schrijft docs", "docs", "Edit", { file_path: "docs/ARCHITECTURE.md" }, 0],
  ["hoofdsessie omzeilt pre-commit niet", null, "Bash", { command: "git commit --no-verify -m x" }, 2],
  ["hoofdsessie zet husky niet uit", null, "Bash", { command: "HUSKY=0 git commit -m x" }, 2],
  ["tekst --no-verify in een string telt niet", null, "Bash", { command: "grep -- '--no-verify' CLAUDE.md" }, 0],
  ["hoofdsessie pusht", null, "Bash", { command: "git push -u origin x" }, 0],
  ["hoofdsessie wijzigt gate (label in CI)", null, "Edit", { file_path: `${root}/scripts/check-rls.mjs` }, 0],
];

for (const [naam, rol, tool, input, exit] of gevallen) {
  test(`rolhek: ${naam}`, () => {
    const payload = { ...(rol ? { agent_type: rol } : {}), tool_name: tool, tool_input: input, cwd: root };
    const r = spawnSync("node", [hook], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    assert.equal(r.status, exit, r.stderr);
    if (exit === 2) assert.match(r.stderr, /^rolhek: /);
  });
}
