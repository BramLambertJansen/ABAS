"use client";

import { Knop } from "@/components/Knop";
import { useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { ONBEKENDE_UITKOMST_TEKST } from "@/lib/opslaan";
import { useShiftCandidates } from "@/hooks/queries/useShiftCandidates";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";
import {
  useAddShiftMember,
  type AddShiftMemberErrorCode,
} from "@/hooks/queries/useAddShiftMember";
import {
  useRemoveShiftMember,
  type RemoveShiftMemberErrorCode,
} from "@/hooks/queries/useRemoveShiftMember";
import { ROLE_LABELS, NO_BAR_STAFF_MESSAGE } from "@/lib/staff";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { RoleBadge } from "@/components/RoleBadge";
import { TekstVeld } from "@/components/TekstVeld";

function addErrorMessage(code: AddShiftMemberErrorCode): string {
  // De zes sessiecodes (dienst-per-sessie) krijgen één centrale melding.
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "shift_not_open":
      return "de dienst is niet meer actief — er kan niemand meer toegevoegd worden";
    case "member_not_eligible":
      return "dit lid kan niet aan de bezetting toegevoegd worden";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

function removeErrorMessage(code: RemoveShiftMemberErrorCode): string {
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "shift_not_open":
      return "de dienst is niet meer actief — er kan niemand meer afgemeld worden";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * The "Bezetting van deze dienst"-overlay: tap a bardienst/beheerder to add
 * them to the shift's roster, tap someone already on it to remove them — no
 * PIN, no confirmation, no exception for the shift's starter (see
 * docs/features/bezetting-beheren.md → "Besloten: zelf-verwijdering").
 */
export function BezettingOverlay({
  shiftId,
  members,
  membersStatus,
  onMembersChanged,
  onClose,
}: {
  shiftId: string;
  members: ShiftMember[];
  membersStatus: "loading" | "error" | "ready";
  onMembersChanged: () => void;
  onClose: () => void;
}) {
  const candidates = useShiftCandidates();
  const addMutation = useAddShiftMember();
  const removeMutation = useRemoveShiftMember();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"add" | "remove" | null>(null);
  const [search, setSearch] = useState("");
  const unavailableId = useId();
  // Geen formulier, dus geen onopgeslagen-beleid: elke tik is direct een actie.
  // Wel blokkeren tijdens die actie, zodat het venster niet onder een lopende
  // mutatie verdwijnt (docs/features/opslaan-sluiten-pending.md).
  const { closeBlocked, timedOut } = useOpslaanBlokkade(pendingId !== null);

  const memberIds = new Set(members.map((member) => member.id));
  const available = candidates.status === "ready" ? candidates.candidates : [];
  const candidateById = new Map(available.map((member) => [member.id, member]));
  // De echte crew is de bron voor verwijderen, ook als een lid niet meer
  // voorkomt in de kandidatenquery of die query tijdelijk niet bereikbaar is.
  const rows = [
    ...members,
    ...available.filter((member) => !memberIds.has(member.id)),
  ].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const query = search.trim().toLocaleLowerCase("nl");
  const visibleRows = rows.filter((member) =>
    member.name.toLocaleLowerCase("nl").includes(query)
  );

  async function toggle(member: ShiftMember) {
    // Wacht op de mutatie en op de actuele crew vóór een volgende toggle.
    if (pendingId || membersStatus !== "ready") return;
    setPendingId(member.id);

    const inBezetting = memberIds.has(member.id);
    setLastAction(inBezetting ? "remove" : "add");

    const ok = inBezetting
      ? await removeMutation.removeShiftMember(shiftId, member.id)
      : await addMutation.addShiftMember(shiftId, member.id);

    setPendingId(null);
    if (ok) {
      onMembersChanged();
    } else if (!inBezetting) {
      candidates.refetch();
    }
    // On failure the row simply stays in its old state — `members` (and
    // therefore memberIds) is only updated by onMembersChanged(), which we
    // deliberately don't call here.
  }

  const errorMessage =
    lastAction === "add" && addMutation.errorCode
      ? addErrorMessage(addMutation.errorCode)
      : lastAction === "remove" && removeMutation.errorCode
        ? removeErrorMessage(removeMutation.errorCode)
        : null;

  return (
    <Overlay
      title="Bezetting van deze dienst"
      description="Iedereen hieronder werkt in dezelfde dienst. Tik iemand aan om toe te voegen of af te melden."
      onClose={onClose}
      closeBlocked={closeBlocked}
    >
      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {timedOut ? ONBEKENDE_UITKOMST_TEKST : (errorMessage ?? "")}
      </p>

      {membersStatus === "loading" && (
        <p className="text-sm font-semibold text-muted" role="status">Bezetting laden…</p>
      )}
      {membersStatus === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-danger" role="alert">Kan de bezetting niet laden.</p>
          <Knop variant="tekst" onClick={onMembersChanged}>
            Bezetting opnieuw laden
          </Knop>
        </div>
      )}

      {candidates.status === "loading" && (
        <p className="text-sm font-semibold text-muted" role="status">
          Bardienst-lijst laden…
        </p>
      )}

      {candidates.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-danger" role="alert">{candidates.message}</p>
          <Knop variant="tekst" onClick={candidates.refetch}>
            Bardienst-lijst opnieuw laden
          </Knop>
        </div>
      )}

      {candidates.status === "ready" && rows.length === 0 && membersStatus === "ready" && (
        <p className="text-sm font-semibold text-muted">
          {NO_BAR_STAFF_MESSAGE}
        </p>
      )}

      {rows.length > 0 && (
        <TekstVeld
          label="Zoek medewerker"
          tone="light"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      {rows.length > 0 && visibleRows.length === 0 && (
        <p className="text-sm font-semibold text-muted" role="status">Geen medewerkers gevonden.</p>
      )}

      {visibleRows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visibleRows.map((member) => {
            const inBezetting = memberIds.has(member.id);
            const isPending = pendingId === member.id;
            const candidate = candidateById.get(member.id);
            const unavailable = inBezetting && candidates.status === "ready" && !candidate;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={pendingId !== null || membersStatus !== "ready"}
                  aria-pressed={inBezetting}
                  aria-describedby={unavailable ? `${unavailableId}-${member.id}` : undefined}
                  aria-label={`${member.name}${candidate ? `, ${ROLE_LABELS[candidate.role]}` : ""}${
                    inBezetting ? ", in de bezetting — tik om af te melden" : ", tik om toe te voegen"
                  }`}
                  onClick={() => toggle(member)}
                  className={`flex w-full min-h-control items-center gap-3 rounded-card border p-3 text-left transition-colors disabled:opacity-50 ${
                    inBezetting
                      ? "border-accent bg-surface"
                      : "border-border bg-surface"
                  }`}
                >
                  <InitialsAvatar name={member.name} size="sm" tone="light" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold text-ink">
                      {member.name}
                    </span>
                    {candidate && <RoleBadge role={candidate.role} tone="light" />}
                    {unavailable && (
                      <span id={`${unavailableId}-${member.id}`} className="text-xs font-semibold text-muted-strong">
                        Niet meer beschikbaar om toe te voegen. Afmelden kan wel.
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-sm font-extrabold ${
                      inBezetting
                        ? "bg-accent-active text-white"
                        : "border border-border text-muted"
                    }`}
                  >
                    {isPending ? "…" : inBezetting ? "✓" : "+"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Knop
        variant="primair" className="w-full"
        disabled={closeBlocked}
        onClick={onClose}
      >
        Klaar
      </Knop>
    </Overlay>
  );
}
