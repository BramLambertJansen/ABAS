"use client";

import { useState } from "react";
import { Overlay } from "@/components/Overlay";
import { useBarStaff, type BarStaffMember } from "@/hooks/queries/useBarStaff";
import type { ShiftMember } from "@/hooks/queries/useShiftMembers";
import {
  useAddShiftMember,
  type AddShiftMemberErrorCode,
} from "@/hooks/queries/useAddShiftMember";
import {
  useRemoveShiftMember,
  type RemoveShiftMemberErrorCode,
} from "@/hooks/queries/useRemoveShiftMember";
import { initials, ROLE_LABELS, NO_BAR_STAFF_MESSAGE } from "@/lib/staff";

function addErrorMessage(code: AddShiftMemberErrorCode): string {
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
  onMembersChanged,
  onClose,
}: {
  shiftId: string;
  members: ShiftMember[];
  onMembersChanged: () => void;
  onClose: () => void;
}) {
  const barStaff = useBarStaff();
  const addMutation = useAddShiftMember();
  const removeMutation = useRemoveShiftMember();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"add" | "remove" | null>(null);

  const memberIds = new Set(members.map((member) => member.id));

  async function toggle(member: BarStaffMember) {
    if (pendingId) return; // one toggle at a time — see "geen scope" op
    // race-condition-bescherming in docs/features/bezetting-beheren.md.
    setPendingId(member.id);

    const inBezetting = memberIds.has(member.id);
    setLastAction(inBezetting ? "remove" : "add");

    const ok = inBezetting
      ? await removeMutation.removeShiftMember(shiftId, member.id)
      : await addMutation.addShiftMember(shiftId, member.id);

    setPendingId(null);
    if (ok) {
      onMembersChanged();
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
    >
      <p className="min-h-[1.25rem] text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      {barStaff.status === "loading" && (
        <p className="text-sm font-semibold text-rail-muted" role="status">
          Bardienst-lijst laden…
        </p>
      )}

      {barStaff.status === "error" && (
        <p className="text-sm font-semibold text-rail-error" role="alert">
          {barStaff.message}
        </p>
      )}

      {barStaff.status === "ready" && barStaff.staff.length === 0 && (
        <p className="text-sm font-semibold text-rail-muted">
          {NO_BAR_STAFF_MESSAGE}
        </p>
      )}

      {barStaff.status === "ready" && barStaff.staff.length > 0 && (
        <ul className="flex flex-col gap-2">
          {barStaff.staff.map((member) => {
            const inBezetting = memberIds.has(member.id);
            const isPending = pendingId === member.id;
            return (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={pendingId !== null}
                  aria-pressed={inBezetting}
                  aria-label={`${member.name}, ${ROLE_LABELS[member.role]}${
                    inBezetting ? ", in de bezetting — tik om af te melden" : ", tik om toe te voegen"
                  }`}
                  onClick={() => toggle(member)}
                  className={`flex w-full min-h-[44px] items-center gap-3 rounded-2xl border p-3 text-left transition-colors disabled:opacity-50 ${
                    inBezetting
                      ? "border-accent bg-rail"
                      : "border-rail-border bg-rail"
                  }`}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rail-border text-xs font-extrabold text-white">
                    {initials(member.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold text-white">
                      {member.name}
                    </span>
                    <span
                      className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                        member.role === "beheerder"
                          ? "bg-accent text-rail"
                          : "bg-rail-border text-white"
                      }`}
                    >
                      {ROLE_LABELS[member.role]}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-sm font-extrabold ${
                      inBezetting
                        ? "bg-accent-active text-white"
                        : "border border-rail-border text-rail-muted"
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

      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-2xl bg-accent-active text-sm font-bold text-white transition-colors hover:bg-accent"
      >
        Klaar
      </button>
    </Overlay>
  );
}
