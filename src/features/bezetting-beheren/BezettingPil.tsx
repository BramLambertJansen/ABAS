import { InitialsAvatar } from "@/components/InitialsAvatar";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";

/**
 * De bezettingspil naast de schermtitel (designs/Bar App.dc.html →
 * `crewAvatars`/`crewLabel`): tot drie overlappende avatars, de voornaam
 * van de eerste met "+N" voor de rest, en een "+"-rondje. Opent de
 * bestaande BezettingOverlay — geen eigen beheerlogica.
 */
export function BezettingPil({
  members,
  loading,
  onOpen,
}: {
  members: ShiftMember[];
  loading: boolean;
  onOpen: () => void;
}) {
  const first = members[0]?.name.split(" ")[0] ?? "";
  const label = loading
    ? "bezetting…"
    : members.length === 0
      ? "nog niemand"
      : members.length === 1
        ? first
        : `${first} +${members.length - 1}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      // Bewust niet "Bezetting wijzigen …": die naam heeft de wijzig-knop
      // op het Dienst-scherm al, en daar staat deze pil ook.
      aria-label={`Bezetting: ${
        members.length ? members.map((m) => m.name).join(", ") : "nog niemand"
      } — tik om te wijzigen`}
      className="flex h-control flex-none items-center gap-[9px] rounded-full border border-border bg-white px-[7px] transition-colors hover:border-ink"
    >
      {members.length > 0 && (
        <span className="flex items-center">
          {members.slice(0, 3).map((member, index) => (
            <InitialsAvatar
              key={member.id}
              name={member.name}
              size="chip"
              tone="light"
              className={`ring-2 ring-white ${index > 0 ? "-ml-2" : ""}`}
            />
          ))}
        </span>
      )}
      <span className={`whitespace-nowrap text-metadata font-bold text-muted-strong ${members.length ? "" : "pl-2"}`}>
        {label}
      </span>
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-border-subtle text-[15px] font-extrabold text-muted-strong"
      >
        +
      </span>
    </button>
  );
}
