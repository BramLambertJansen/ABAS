import { InitialsAvatar } from "@/components/InitialsAvatar";

/**
 * Read-only "who's here" pill: small avatar + name, horizontal, not
 * interactive — DienstAfsluitenOverlay.tsx's bezetting list (`<ul>` of
 * these). Not
 * BezettingOverlay.tsx's toggle row (that one adds a role badge and an
 * add/remove control — different enough to stay its own bespoke button
 * markup, built from InitialsAvatar + RoleBadge directly rather than this)
 * and not StaffPicker.tsx's picker card (a full clickable card, not a
 * pill).
 *
 * Reviewer-flagged duplication — see CLAUDE.md → "Componenten zijn
 * herbruikbaar totdat bewezen anders". Renders an `<li>`, not a `<div>`:
 * its consumer renders it inside a `<ul>`. (The old "Dienst actief"-card,
 * DienstActief.tsx, was the other consumer until the Dienst-scherm was
 * aligned with the design — docs/features/dienst-overzicht.md; that
 * screen shows the bezetting as rows with a bonnen-count instead.)
 */
export function MemberPill({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full border border-rail-border bg-rail px-2.5 py-1 text-xs font-bold text-white">
      <InitialsAvatar name={name} size="xs" />
      {name}
    </li>
  );
}
