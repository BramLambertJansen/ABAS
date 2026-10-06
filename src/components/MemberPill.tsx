import { InitialsAvatar } from "@/components/InitialsAvatar";

/**
 * Read-only "who's here" pill: small avatar + name, horizontal, not
 * interactive — DienstAfsluitenOverlay.tsx's bezetting list (`<ul>` of these). Not
 * BezettingOverlay.tsx's toggle row (that one adds a role badge and an
 * add/remove control — different enough to stay its own bespoke button
 * markup, built from InitialsAvatar + RoleBadge directly rather than this)
 * and not StaffPicker.tsx's picker card (a full clickable card, not a
 * pill).
 *
 * Rendert een `<li>` voor de `<ul>` in `DienstAfsluitenOverlay`;
 * avatar en naam blijven één gedeelde presentatie.
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
