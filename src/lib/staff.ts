import type { BarStaffMember } from "@/hooks/queries/useBarStaff";

/** Consumed by `src/components/InitialsAvatar.tsx`, the shared "initials in
 *  a circle" avatar (per CLAUDE.md → "Componenten zijn herbruikbaar totdat
 *  bewezen anders"). Not Supabase-related, just a plain formatting helper —
 *  living in src/lib/ alongside (not inside) the Supabase-only
 *  client/server files there. Stays a plain string function, not JSX, so
 *  non-visual callers (if any show up) don't need to render anything to
 *  use it. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Consumed by `src/components/RoleBadge.tsx`, the shared role pill —
 *  callers pass a role, RoleBadge looks up the label itself rather than
 *  the call site importing this map directly. */
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

/** Melding bij `no_bar_role` uit een bar-RPC (0023_bar_rpcs_weigeren_lid.sql:
 *  top_up, place_order, reverse_order_at_bar, end_shift, add_shift_member,
 *  remove_shift_member weigeren een lid-sessie). Eén tekst voor alle zes,
 *  besloten in #100. Niet voor `start_shift`'s eigen `no_bar_role` — daar
 *  gaat het om de rol van het gekozen lid, niet om de sessie. */
export const NO_BAR_ROLE_SESSION_MESSAGE =
  "dit account mag niet op de bar werken — log uit en log in als bardienst";
