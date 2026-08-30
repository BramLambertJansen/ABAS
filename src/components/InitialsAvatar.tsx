import { initials } from "@/lib/staff";

/**
 * Initials-in-a-circle avatar. Always `aria-hidden="true"` — every current
 * call site (StaffPicker.tsx, DienstActief.tsx, BezettingOverlay.tsx, and
 * MemberPill.tsx below) renders the member's full name as visible sibling
 * text right next to it, so the initials would otherwise be announced
 * twice. `initials()` itself stays a plain string helper in
 * src/lib/staff.ts, no JSX there.
 *
 * Reviewer-flagged duplication across those three files — see CLAUDE.md →
 * "Componenten zijn herbruikbaar totdat bewezen anders".
 *
 * `size` is the three sizes the three current call sites actually use, not
 * a free-form number — add a variant here if a fourth size shows up, don't
 * reach for an arbitrary px value at the call site:
 * - "xs" — DienstActief.tsx's read-only bezetting pill (via MemberPill)
 * - "sm" — BezettingOverlay.tsx's add/remove toggle row
 * - "md" — StaffPicker.tsx's dienst-starten picker card
 */
export function InitialsAvatar({
  name,
  size,
}: {
  name: string;
  size: "xs" | "sm" | "md";
}) {
  const sizeClasses =
    size === "xs"
      ? "h-5 w-5 text-[9px]"
      : size === "sm"
        ? "h-9 w-9 text-xs"
        : "h-10 w-10 text-sm";

  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full bg-rail-border font-extrabold text-white ${sizeClasses}`}
    >
      {initials(name)}
    </span>
  );
}
