import { DienstStarten } from "@/features/dienst-starten/DienstStarten";

/**
 * Bar shell's entry screen. Real screen now (issue #6, spec:
 * docs/features/dienst-starten.md) — the scaffold placeholder this used to
 * be is gone. Thin mount point only: the actual screen lives in
 * src/features/ and stays shell-agnostic per CLAUDE.md → Shells.
 */
export default function BarShellHome() {
  return <DienstStarten />;
}
