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
 * - "chip" — BezettingPil.tsx's overlappende avatars en de bezettingsrijen
 *   op het Dienst-scherm (26px, prototype)
 * - "sm" — BezettingOverlay.tsx's add/remove toggle row
 * - "md" — StaffPicker.tsx's dienst-starten picker card
 * - "lg" — StaffHeader.tsx boven activiteitkeuze en pincode (48px)
 *
 * `tone` volgt de ondergrond: "dark" op de donkere rail-schermen
 * (standaard), "light" in de witte Overlay.tsx-dialogen.
 */
export function InitialsAvatar({
  name,
  size,
  tone = "dark",
  className = "",
}: {
  name: string;
  size: "xs" | "chip" | "sm" | "md" | "lg";
  tone?: "dark" | "light";
  className?: string;
}) {
  const sizeClasses =
    size === "xs"
      ? "h-5 w-5 text-[9px]"
      : size === "chip"
        ? "h-[26px] w-[26px] text-[10px]"
        : size === "sm"
          ? "h-9 w-9 text-xs"
          : size === "md"
            ? "h-10 w-10 text-sm"
            : "h-12 w-12 text-sm";

  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full font-extrabold ${
        tone === "light" ? "bg-border-subtle text-muted-strong" : "bg-rail-border text-white"
      } ${sizeClasses} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
