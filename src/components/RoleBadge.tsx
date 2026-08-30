import type { BarStaffMember } from "@/hooks/queries/useBarStaff";
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
 */
export function RoleBadge({ role }: { role: BarStaffMember["role"] }) {
  return (
    <span
      className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
        role === "beheerder" ? "bg-accent text-rail" : "bg-rail-border text-white"
      }`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
