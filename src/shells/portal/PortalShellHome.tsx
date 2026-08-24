"use client";

import { useShell } from "@/lib/shell/ShellProvider";

/** Scaffold placeholder — portal shell is out of scope for the current MVP
 *  (see CLAUDE.md, docs/ARCHITECTURE.md). Exists to prove the two-shell
 *  split works, not as a real screen. */
export default function PortalShellHome() {
  const shell = useShell();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-extrabold tracking-tight">ABAS — portal</h1>
      <p className="max-w-xs text-sm font-medium text-muted">
        Scaffold only, not started. density={shell.density}, overlay=
        {shell.overlay}, columns={shell.columns}.
      </p>
    </main>
  );
}
