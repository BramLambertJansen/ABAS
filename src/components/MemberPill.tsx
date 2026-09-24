import { InitialsAvatar } from "@/components/InitialsAvatar";

/**
 * Read-only "who's here" pill: small avatar + name, horizontal, not
 * interactive — DienstActief.tsx's bezetting list (`<ul>` of these). Not
 * BezettingOverlay.tsx's toggle row (that one adds a role badge and an
 * add/remove control — different enough to stay its own bespoke button
 * markup, built from InitialsAvatar + RoleBadge directly rather than this)
 * and not StaffPicker.tsx's picker card (a full clickable card, not a
 * pill).
 *
 * Reviewer-flagged duplication — see CLAUDE.md → "Componenten zijn
 * herbruikbaar totdat bewezen anders". Renders an `<li>`, not a `<div>`:
 * both its current and its next known consumer render it inside a `<ul>`
 * (DienstActief.tsx today; an unmerged branch — issue #12,
 * DienstAfsluitenOverlay.tsx — has this exact same pill markup again,
 * byte-for-byte, which is what makes this worth a named component rather
 * than just sharing InitialsAvatar/RoleBadge sub-parts). Not built against
 * that branch here — it isn't merged yet — but this component's shape is
 * chosen so that branch can adopt it unchanged later.
 *
 * `tone`: "dark" op de rail-schermen (standaard), "light" in de witte
 * Overlay.tsx-dialogen (DienstAfsluitenOverlay.tsx).
 */
export function MemberPill({
  name,
  tone = "dark",
}: {
  name: string;
  tone?: "dark" | "light";
}) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
        tone === "light"
          ? "border-border bg-white text-ink"
          : "border-rail-border bg-rail text-white"
      }`}
    >
      <InitialsAvatar name={name} size="xs" tone={tone} />
      {name}
    </li>
  );
}
