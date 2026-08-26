import type { BarStaffMember } from "@/hooks/queries/useBarStaff";

/** Shared with StaffPicker.tsx and bezetting-beheren's row markup — same
 *  "initials in a circle + role badge" visual pattern, per CLAUDE.md →
 *  "Componenten zijn herbruikbaar totdat bewezen anders". Not Supabase-
 *  related, just a plain formatting helper — living in src/lib/ alongside
 *  (not inside) the Supabase-only client/server files there. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const ROLE_LABELS: Record<BarStaffMember["role"], string> = {
  bardienst: "bardienst",
  beheerder: "beheerder",
};

/** Shared empty-state copy for an empty bardienst/beheerder candidate pool
 *  — used by both StaffPicker.tsx (dienst starten) and BezettingOverlay.tsx
 *  (bezetting beheren), same underlying condition (useBarStaff() returns
 *  no eligible members). */
export const NO_BAR_STAFF_MESSAGE =
  "Geen bardienst-/beheerdersaccounts gevonden. Vraag een bestuurslid om je de rol bardienst of beheerder te geven.";
