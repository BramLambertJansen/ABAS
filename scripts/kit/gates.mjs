// Register van de gates: wat elk npm-script bewaakt. Enige bron voor de
// gate-tabel; CLAUDE.md en de rolprompts verwijzen hierheen via
// `node scripts/kit/feiten.mjs`. check:docs eist dat elk script in
// `check:all` hier staat en omgekeerd (ADR 0025).
//
// `snel: true` = draait zonder database, dus ook in de pre-commit hook
// (`check:fast`). De rest laten we aan CI over.
export const GATES = [
  { script: "lint", snel: true, bewaakt: "ESLint met --max-warnings=0: next, jsx-a11y, typescript-eslint strictTypeChecked, better-tailwindcss; bestaande overtredingen staan in eslint-suppressions.json en mogen alleen dalen (`npm run lint:prune` legt een daling vast)" },
  { script: "typecheck", snel: true, bewaakt: "tsc strict, incl. noUncheckedIndexedAccess" },
  { script: "test", snel: true, bewaakt: "pure client-logica (`src/lib/money.ts`, mandjelogica), contrast van accent-tokens en van bg/tekst-paren binnen één klasse-literal (geen dekking voor clsx/ternaries, alpha of arbitraire kleuren), de rolhek- en groen-voor-klaar-hooks" },
  { script: "check:arch", snel: true, bewaakt: "shells geïsoleerd, features shell-onwetend, Supabase-client privé (ook via relatieve imports); `server-only` verplicht op src/lib/supabase/{admin,server,portalServer}.ts en geen clientmodule bereikt die, ook niet transitief (ADR 0021)" },
  { script: "check:policy", snel: true, bewaakt: "geen `.from(`/`.rpc(`/storage buiten de datalaag, ongeacht de variabelenaam; geen device-sniffing; geen kale console.error in src/hooks/queries/ (fouten via src/lib/clientErrors.ts)" },
  { script: "check:rls", snel: true, bewaakt: "elke tabel RLS, elke policy (per naam) een negatieve test, geldtabellen REVOKED, elke bucket een type- en groottelimiet, elke storage-policy een negatieve test" },
  { script: "check:migrations", snel: true, bewaakt: "migratienamen NNNN_naam.sql, uniek nummer; append-only: een bestaande migratie wijzigen of verwijderen faalt" },
  { script: "check:adr", snel: true, bewaakt: "ADR-namen NNNN-naam.md, uniek nummer" },
  { script: "check:docs", snel: true, bewaakt: "statuswoord van ADR's en specs (voorstel|goedgekeurd|gebouwd|vervallen); goedgekeurde specs hebben 'Hergebruik & UX-patronen'; backtick-identifiers in CLAUDE.md, .claude/agents, .claude/rules en skills bestaan in de repo; gateregister = check:all; elk component een README-rij; specs zonder status in de ratchet (.kit/baseline.json)" },
  { script: "check:deployment", snel: false, bewaakt: "RPC-signaturen en kolommen die de app gebruikt bestaan in de database (read-only contractcheck)" },
  { script: "build", snel: false, bewaakt: "next build slaagt" },
  { script: "check:a11y", snel: false, bewaakt: "WCAG-AA via axe-core op elk shell-entrypoint (Playwright)" },
  { script: "db:test", snel: false, bewaakt: "pgTAP tegen een echte database: de negatieve tests; rpc_catalogus (elke public-functie client/server/intern met passende rechten, client-RPC via require_*-guard of reden, search_path op elke security definer); rls_leespolicies (allowlist, caller_session_alive())" },
  { script: "test:integration", snel: false, bewaakt: "koppel- en sessiegedrag tegen de echte GoTrue (amr uit maillinks, wissen bij koppelen, token van beëindigde sessie leest niets, cron sluit verweesde bar-sessies), geldverzoeken" },
];
