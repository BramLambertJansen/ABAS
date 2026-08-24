"use client";

import { useShell } from "@/lib/shell/ShellProvider";

/**
 * Scaffold placeholder for the bar shell's entry screen. No feature spec
 * exists yet for the real sales/dienst screens (docs/features/ is empty).
 * Replace once one is approved — don't build the real UI here without a
 * spec per CLAUDE.md → Werkstraat.
 */
export default function BarShellHome() {
  const shell = useShell();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-xl font-extrabold text-white">
        A
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">ABAS — bar</h1>
      <p className="max-w-sm text-sm font-medium text-muted">
        Scaffold only. Shell capabilities: density={shell.density}, overlay=
        {shell.overlay}, columns={shell.columns}.
      </p>
    </main>
  );
}
