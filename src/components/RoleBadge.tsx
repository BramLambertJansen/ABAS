import type { ShiftCandidate } from "@/hooks/queries/useShiftCandidates";
import { ROLE_LABELS } from "@/lib/staff";

/**
 * Role pill ("bardienst" / "beheerder") — identical in StaffPicker.tsx and
 * BezettingOverlay.tsx: accent-colored for beheerder, neutral otherwise,
 * but never color alone — the label text (ROLE_LABELS, src/lib/staff.ts)
 * is always shown too, not just the background color.
 *
 * Reviewer-flagged duplication — see CLAUDE.md → "Componenten zijn
 * herbruikbaar totdat bewezen anders". `w-fit` is a no-op in
 * StaffPicker.tsx's `items-center` card (already sized to content) but
 * required in BezettingOverlay.tsx's `flex-1 flex-col` row, where a plain
 * span would otherwise stretch to the row's full width.
 *
 * `tone`: "dark" op de rail-schermen (standaard), "light" in de witte
 * Overlay.tsx-dialogen — alleen de neutrale bardienst-pill verschilt.
 */
export function RoleBadge({
  role,
  tone = "dark",
}: {
  role: ShiftCandidate["role"];
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={`w-fit rounded-full px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.06em] ${
        role === "beheerder"
          ? tone === "light"
            ? "bg-accent-soft text-danger"
            : "bg-accent/20 text-rail-error"
          : tone === "light"
            ? "bg-border-subtle text-muted-strong"
            : "bg-rail-border text-rail-light"
      }`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
