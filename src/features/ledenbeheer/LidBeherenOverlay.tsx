"use client";

import { useEffect, useId, useState } from "react";
import { Overlay } from "@/components/Overlay";
import {
  useUpdateMemberName,
  type UpdateMemberNameErrorCode,
} from "@/hooks/queries/useUpdateMemberName";
import {
  useUpdateMemberEmail,
  type UpdateMemberEmailErrorCode,
} from "@/hooks/queries/useUpdateMemberEmail";
import {
  useSetMemberRole,
  type SetMemberRoleErrorCode,
} from "@/hooks/queries/useSetMemberRole";
import {
  useSetMemberArchived,
  type SetMemberArchivedErrorCode,
} from "@/hooks/queries/useSetMemberArchived";
import {
  useSendMemberInvite,
  type SendMemberInviteErrorCode,
} from "@/hooks/queries/useSendMemberInvite";
import type { LedenbeheerLid } from "@/hooks/queries/useAlleLeden";
import { formatCents } from "@/lib/money";
import { isValidEmailFormat } from "@/lib/email";
import { formatDate } from "@/lib/date";
import { RATE_LIMITED_MESSAGE } from "@/lib/authErrors";

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

function emailErrorMessage(code: UpdateMemberEmailErrorCode): string {
  switch (code) {
    case "invalid_email":
      return "vul een geldig e-mailadres in, of laat het veld leeg";
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

/** Copy exact overgenomen uit docs/features/lid-account-invite.md →
 *  Architect-beslissingen → Copy. `actor_not_found`/`no_admin_role`/
 *  `member_not_found` zijn letterlijk hergebruikt van de andere drie acties
 *  hierboven; `already_linked`/`email_already_registered`/`rate_limited`
 *  zijn nieuw voor dit ticket. */
function inviteErrorMessage(code: SendMemberInviteErrorCode): string {
  switch (code) {
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan leden niet beheren — vraag een beheerder";
    case "member_not_found":
      return "dit lid bestaat niet meer — de lijst is bijgewerkt";
    case "already_linked":
      return "dit lid heeft inmiddels al een account — de lijst is bijgewerkt";
    case "email_already_registered":
      return "dit e-mailadres is al gekoppeld aan een ander account — controleer of dit bij een ander lid hoort";
    case "rate_limited":
      return RATE_LIMITED_MESSAGE;
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/** Drie standen (docs/features/lid-account-invite.md → Datamodel/Schermflow
 *  stap 1): "account gekoppeld" wint van alles, anders "nog niet
 *  uitgenodigd"/"uitgenodigd op [datum], nog geen account" op basis van
 *  invitedAt. */
function accountStatusText(member: LedenbeheerLid): string {
  if (member.hasAccount) return "account gekoppeld";
  if (member.invitedAt === null) return "nog niet uitgenodigd";
  return `uitgenodigd op ${formatDate(member.invitedAt)}, nog geen account`;
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
 * bewerkbare selector: onder ADR 0005 is de enige schrijfactie (PIN aan/uit)
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
  const [emailInput, setEmailInput] = useState(initialMember.email ?? "");
  const [roleValue, setRoleValue] = useState<LedenbeheerLid["role"]>(
    initialMember.role
  );
  const [lastAction, setLastAction] = useState<
    "name" | "email" | "role" | "archive" | "invite" | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  const nameMutation = useUpdateMemberName();
  const emailMutation = useUpdateMemberEmail();
  const roleMutation = useSetMemberRole();
  const archiveMutation = useSetMemberArchived();
  const inviteMutation = useSendMemberInvite();

  const nameId = useId();
  const emailId = useId();
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

  const trimmedEmail = emailInput.trim();
  const currentEmail = member.email ?? "";
  const emailFormatValid = trimmedEmail === "" || isValidEmailFormat(trimmedEmail);
  const canSaveEmail =
    trimmedEmail !== currentEmail &&
    emailFormatValid &&
    emailMutation.status !== "pending";

  async function saveEmail() {
    if (!canSaveEmail) return;
    setLastAction("email");
    const result = await emailMutation.updateMemberEmail(
      member.id,
      trimmedEmail === "" ? null : trimmedEmail
    );
    if (result.member) {
      setMember(result.member);
      setEmailInput(result.member.email ?? "");
      onChanged();
      showToast("E-mailadres bijgewerkt");
    } else if (result.errorCode === "member_not_found") {
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

  /** Alleen zichtbaar bij `member.email !== null` (spec → Schermflow stap
   *  2) — geen e-mailadres, geen invite-mogelijkheid. Disabled zodra
   *  `member.hasAccount` (spec → Architect-beslissingen → Zichtbaarheid). */
  async function sendInvite() {
    if (member.hasAccount || inviteMutation.status === "pending") return;
    setLastAction("invite");
    const result = await inviteMutation.sendInvite(member.id);
    if (result.errorCode === null) {
      if (result.invited) {
        // (Herzien, PR #62-review, Bug 1-fix): alleen `invitedAt` verversen
        // — `hasAccount` blijft ongemoeid. Het lid heeft ná het versturen
        // van een invite nog steeds geen gekoppeld account; dat gebeurt pas
        // bij acceptatie (link_invited_member_account, /beheer/callback).
        // Een beheerder ziet `hasAccount` pas `true` worden nadat het lid de
        // link daadwerkelijk gebruikt heeft én de ledenlijst ververst wordt.
        setMember({ ...member, invitedAt: result.invitedAt });
        onChanged();
        showToast("Uitnodiging verstuurd");
      }
      // invited: false (niet eligible, spec → RPC's punt 3.3) is met de
      // huidige UI-gating (email !== null, sectie al role-gated) niet
      // bereikbaar buiten een race — geen toast/foutmelding hiervoor
      // gespecificeerd.
      return;
    }
    if (result.errorCode === "member_not_found" || result.errorCode === "already_linked") {
      onChanged();
    }
  }

  const errorMessage =
    lastAction === "name" && nameMutation.errorCode
      ? nameErrorMessage(nameMutation.errorCode)
      : lastAction === "email" && emailMutation.errorCode
        ? emailErrorMessage(emailMutation.errorCode)
        : lastAction === "role" && roleMutation.errorCode
          ? roleErrorMessage(roleMutation.errorCode)
          : lastAction === "archive" && archiveMutation.errorCode
            ? archiveErrorMessage(archiveMutation.errorCode)
            : lastAction === "invite" && inviteMutation.errorCode
              ? inviteErrorMessage(inviteMutation.errorCode)
              : null;

  return (
    <Overlay
      title="Lid beheren"
      description={`Wijzigingen aan ${member.name}.`}
      onClose={onClose}
    >
      <div aria-live="polite" role="status" className="empty:-mt-4">
        {toast && <p className="text-sm font-bold text-ink">{toast}</p>}
      </div>

      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {errorMessage ?? ""}
      </p>

      <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
          Saldo
        </span>
        <span className="text-sm font-extrabold text-ink">
          {formatCents(member.balanceCents)}
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Naam wijzigen</span>
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
            className="h-11 flex-1 min-w-0 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!canSaveName}
            onClick={saveName}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            Opslaan
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">E-mailadres</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={emailId} className="sr-only">
            E-mailadres
          </label>
          <input
            id={emailId}
            type="email"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            className="h-11 flex-1 min-w-0 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!canSaveEmail}
            onClick={saveEmail}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            Opslaan
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-border p-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Barrechten</span>
          <span className="text-xs font-medium text-muted">
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
            className="h-11 flex-1 min-w-0 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
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
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            Opslaan
          </button>
        </div>
      </div>

      {member.role !== "lid" && (
        <div className="flex flex-col gap-2 rounded-control border border-border p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-ink">Inloggegevens</span>
            <span className="text-xs font-medium text-muted">
              pincode is alleen-lezen — dit lid beheert &apos;m zelf via &quot;Mijn account&quot;
            </span>
          </div>
          <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Wachtwoordaccount
            </span>
            <span className="text-sm font-extrabold text-ink">
              {accountStatusText(member)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Pincode
            </span>
            <span className="text-sm font-extrabold text-ink">
              {member.hasPin ? "ingesteld" : "niet ingesteld"}
            </span>
          </div>
          {member.email !== null && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={member.hasAccount || inviteMutation.status === "pending"}
                onClick={sendInvite}
                className="flex h-11 w-full items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
              >
                {member.invitedAt === null ? "Invite versturen" : "Invite opnieuw versturen"}
              </button>
              <span className="text-xs font-medium text-muted">
                {member.hasAccount
                  ? "dit lid heeft al een account — een nieuwe uitnodiging is niet nodig"
                  : member.invitedAt === null
                    ? "stuurt een e-mail met een inloglink voor dit lid"
                    : "stuurt de inloglink opnieuw — bijvoorbeeld als de vorige e-mail gemist is"}
              </span>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={archiveMutation.status === "pending"}
        onClick={toggleArchived}
        className="flex items-center justify-between gap-3 rounded-control border border-border p-3.5 text-left transition-colors hover:border-danger disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-danger">
            {member.archived ? "Lid terugzetten" : "Lid archiveren"}
          </span>
          <span className="text-xs font-medium text-muted">
            {member.archived
              ? "lid kan weer tikken en opwaarderen"
              : "lid verdwijnt uit de verkoopzoeker"}
          </span>
        </span>
        <span aria-hidden="true" className="text-base font-bold text-muted">
          ›
        </span>
      </button>

      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink"
      >
        Sluiten
      </button>
    </Overlay>
  );
}
