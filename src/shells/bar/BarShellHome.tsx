import { BarApp } from "@/features/bar-sessie/BarApp";

/**
 * Bar shell's entry screen. Thin mount point only: the actual screens live in
 * src/features/ and stay shell-agnostic per CLAUDE.md → Shells. Since
 * dienst-per-sessie (ADR 0016) this is the persoonlijke sessie flow: namenlijst
 * login, hervatscherm, dienst starten of de eigen dienst
 * (docs/features/dienst-per-sessie.md); before that it was the PIN flow of
 * docs/features/dienst-starten.md.
 */
export default function BarShellHome() {
  return <BarApp />;
}
