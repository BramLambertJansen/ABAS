import { initials } from "@/lib/staff";

/**
 * Initials-in-a-circle avatar. Always `aria-hidden="true"` — every current
 * call site (StaffPicker.tsx, DienstOverzicht.tsx, Transactielijst.tsx,
 * BezettingOverlay.tsx, and MemberPill.tsx below) renders the member's full name as visible sibling
 * text right next to it, so the initials would otherwise be announced
 * twice. `initials()` itself stays a plain string helper in
 * src/lib/staff.ts, no JSX there.
 *
 * Reviewer-flagged duplication across those three files — see CLAUDE.md →
 * "Componenten zijn herbruikbaar totdat bewezen anders".
 *
 * `size` is the sizes the current call sites actually use, not a
 * free-form number — add a variant here if another size shows up, don't
 * reach for an arbitrary px value at the call site:
 * - "xs" — the read-only bezetting pill (via MemberPill)
 * - "chip" — DienstOverzicht.tsx's bezettingschip, bezettingsrijen and
 *   transactieregels (26px, as in the design)
 * - "sm" — BezettingOverlay.tsx's add/remove toggle row
 * - "md" — StaffPicker.tsx's dienst-starten picker card
 * - "lg" — DienstOverzicht.tsx's "wie draait deze dienst"-kop (44px)
 *
 * `tone`: "rail" (default) for the dark screens and dialogs, "light" for
 * the light canvas of the Dienst-scherm (`#f4efe8` as in the design, with
 * `ink-soft` text: `muted` is only 4.46:1 on that background).
 */
export function InitialsAvatar({
  name,
  size,
  tone = "rail",
}: {
  name: string;
  size: "xs" | "chip" | "sm" | "md" | "lg";
  tone?: "rail" | "light";
}) {
  const sizeClasses = {
    xs: "h-5 w-5 text-[9px]",
    chip: "h-[26px] w-[26px] text-[10px]",
    sm: "h-9 w-9 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-11 w-11 text-sm",
  }[size];
  const toneClasses =
    tone === "light" ? "bg-border-subtle text-ink-soft" : "bg-rail-border text-white";

  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full font-extrabold ${toneClasses} ${sizeClasses}`}
    >
      {initials(name)}
    </span>
  );
}
