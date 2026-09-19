"use client";

import { useEffect, useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import {
  useUpdateMemberName,
  type UpdateMemberNameErrorCode,
} from "@/hooks/queries/useUpdateMemberName";
import {
  useSetMemberRole,
  type SetMemberRoleErrorCode,
} from "@/hooks/queries/useSetMemberRole";
import {
  useSetMemberArchived,
  type SetMemberArchivedErrorCode,
} from "@/hooks/queries/useSetMemberArchived";
import type { LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { formatCents } from "@/lib/money";

const TOAST_DURATION_MS = 3500;

const ROLE_OPTIONS: { value: LedenbeheerLid["role"]; label: string }[] = [
  { value: "lid", label: "Lid" },
  { value: "bardienst", label: "Bardienst" },
  { value: "beheerder", label: "Beheerder" },
];

function nameErrorMessage(code: UpdateMemberNameErrorCode): string {
  switch (code) {
    case "invalid_name":
      return "vul een naam in";
    case "member_not_found":
      return "dit lid bestaat niet meer — de lijst is bijgewerkt";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan leden niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

function roleErrorMessage(code: SetMemberRoleErrorCode): string {
  switch (code) {
    case "invalid_role":
      return "kies een geldige rol";
    case "self_demote_forbidden":
      return "je kunt je eigen rechten niet verlagen — vraag een andere beheerder";
    case "member_not_found":
      return "dit lid bestaat niet meer — de lijst is bijgewerkt";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan leden niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

function archiveErrorMessage(code: SetMemberArchivedErrorCode): string {
  switch (code) {
    case "self_archive_forbidden":
      return "je kunt jezelf niet archiveren — vraag een andere beheerder";
    case "member_not_found":
      return "dit lid bestaat niet meer — de lijst is bijgewerkt";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan leden niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * "Lid beheren"-overlay: naam wijzigen, barrechten en archiveren/
 * terugzetten — drie onafhankelijke schrijfacties in dezelfde
 * overlay-instantie (geen gecombineerde aanroep), zelfde vorm als
 * `ProductBeherenOverlay.tsx`. Zie docs/features/ledenbeheer.md →
 * Schermflow stap 3. De overlay sluit niet vanzelf na een geslaagde actie
 * (Sluiten/Escape/backdrop is de enige weg terug, zie Schermflow stap 4:
 * "refetch bij elke succesvolle mutatie, niet pas bij sluiten") — elke
 * actie toont zijn eigen succes-toast binnen de overlay zelf.
 *
 * Uitgebreid met een alleen-lezen "Inloggegevens"-sectie
 * (docs/features/auth-methode-per-lid.md, #42) — zichtbaar zodra
 * `member.role` (laatst opgeslagen rol) `bardienst`/`beheerder` is. Geen
 * bewerkbare selector: onder ADR 0004 is de enige schrijfactie (PIN aan/uit)
 * zelfbediening via `set_own_pin` ("Mijn account"), niet iets een beheerder
 * hier namens een ander lid doet — zie de spec → "Besloten door de
 * Architect" punt 3 voor waarom dat verschilt van een eerdere conceptspec.
 */
export function LidBeherenOverlay({
  member: initialMember,
  onClose,
  onChanged,
}: {
  member: LedenbeheerLid;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [member, setMember] = useState(initialMember);
  const [nameInput, setNameInput] = useState(initialMember.name);
  const [roleValue, setRoleValue] = useState<LedenbeheerLid["role"]>(
    initialMember.role
  );
  const [lastAction, setLastAction] = useState<"name" | "role" | "archive" | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);

  const nameMutation = useUpdateMemberName();
  const roleMutation = useSetMemberRole();
  const archiveMutation = useSetMemberArchived();

  const nameId = useId();
  const roleId = useId();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(message: string) {
    setToast(message);
  }

  const trimmedName = nameInput.trim();
  const canSaveName =
    trimmedName !== "" && trimmedName !== member.name && nameMutation.status !== "pending";

  async function saveName() {
    if (!canSaveName) return;
    setLastAction("name");
    const updated = await nameMutation.updateMemberName(member.id, trimmedName);
    if (updated) {
      setMember(updated);
      setNameInput(updated.name);
      onChanged();
      showToast("Naam bijgewerkt");
    } else if (nameMutation.errorCode === "member_not_found") {
      onChanged();
    }
  }

  const canSaveRole = roleValue !== member.role && roleMutation.status !== "pending";

  async function saveRole() {
    if (!canSaveRole) return;
    setLastAction("role");
    const updated = await roleMutation.setMemberRole(member.id, roleValue);
    if (updated) {
      setMember(updated);
      setRoleValue(updated.role);
      onChanged();
      showToast("Rechten bijgewerkt");
    } else {
      // Zowel bij self_demote_forbidden als member_not_found: de select
      // springt terug naar de huidige rol, het formulier sluit niet (spec →
      // Schermflow stap 3).
      setRoleValue(member.role);
      if (roleMutation.errorCode === "member_not_found") {
        onChanged();
      }
    }
  }

  async function toggleArchived() {
    setLastAction("archive");
    const nextArchived = !member.archived;
    const updated = await archiveMutation.setMemberArchived(member.id, nextArchived);
    if (updated) {
      setMember(updated);
      onChanged();
      showToast(`${updated.name} ${updated.archived ? "gearchiveerd" : "teruggezet"}`);
    } else if (archiveMutation.errorCode === "member_not_found") {
      onChanged();
    }
  }

  const errorMessage =
    lastAction === "name" && nameMutation.errorCode
      ? nameErrorMessage(nameMutation.errorCode)
      : lastAction === "role" && roleMutation.errorCode
        ? roleErrorMessage(roleMutation.errorCode)
        : lastAction === "archive" && archiveMutation.errorCode
          ? archiveErrorMessage(archiveMutation.errorCode)
          : null;

  return (
    <Overlay
      title="Lid beheren"
      description={`Wijzigingen aan ${member.name}.`}
      onClose={onClose}
    >
      <div aria-live="polite" role="status" className="min-h-[1.25rem]">
        {toast && <p className="text-sm font-bold text-white">{toast}</p>}
      </div>

      <p className="min-h-[1.25rem] text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      <div className="flex items-center justify-between rounded-control bg-rail px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-rail-muted">
          Saldo
        </span>
        <span className="text-sm font-extrabold text-white">
          {formatCents(member.balanceCents)}
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-rail-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-white">Naam wijzigen</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={nameId} className="sr-only">
            Naam
          </label>
          <input
            id={nameId}
            type="text"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            className="h-11 flex-1 min-w-0 rounded-control border border-rail-border bg-rail px-3.5 text-sm font-semibold text-white outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!canSaveName}
            onClick={saveName}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Opslaan
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-rail-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-white">Barrechten</span>
          <span className="text-xs font-medium text-rail-muted">
            bardienst staat achter de bar, beheerder beheert de vereniging
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={roleId} className="sr-only">
            Barrechten
          </label>
          <select
            id={roleId}
            value={roleValue}
            onChange={(event) =>
              setRoleValue(event.target.value as LedenbeheerLid["role"])
            }
            className="h-11 flex-1 min-w-0 rounded-control border border-rail-border bg-rail px-3.5 text-sm font-semibold text-white outline-none focus:border-accent"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!canSaveRole}
            onClick={saveRole}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Opslaan
          </button>
        </div>
      </div>

      {member.role !== "lid" && (
        <div className="flex flex-col gap-2 rounded-control border border-rail-border p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Inloggegevens</span>
            <span className="text-xs font-medium text-rail-muted">
              alleen-lezen — dit lid beheert de eigen pincode zelf via &quot;Mijn account&quot;
            </span>
          </div>
          <div className="flex items-center justify-between rounded-control bg-rail px-3.5 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-rail-muted">
              Wachtwoordaccount
            </span>
            <span className="text-sm font-extrabold text-white">
              {member.hasAccount ? "gekoppeld" : "niet gekoppeld"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-control bg-rail px-3.5 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-rail-muted">
              Pincode
            </span>
            <span className="text-sm font-extrabold text-white">
              {member.hasPin ? "ingesteld" : "niet ingesteld"}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={archiveMutation.status === "pending"}
        onClick={toggleArchived}
        className="flex items-center justify-between gap-3 rounded-control border border-rail-border p-3.5 text-left transition-colors hover:border-rail-error disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-rail-error">
            {member.archived ? "Lid terugzetten" : "Lid archiveren"}
          </span>
          <span className="text-xs font-medium text-rail-muted">
            {member.archived
              ? "lid kan weer tikken en opwaarderen"
              : "lid verdwijnt uit de verkoopzoeker"}
          </span>
        </span>
        <span aria-hidden="true" className="text-base font-bold text-rail-muted">
          ›
        </span>
      </button>

      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-rail-border bg-rail text-sm font-bold text-white transition-colors hover:border-accent"
      >
        Sluiten
      </button>
    </Overlay>
  );
}
