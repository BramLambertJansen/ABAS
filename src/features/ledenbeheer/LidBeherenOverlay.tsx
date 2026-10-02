"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Overlay } from "@/components/Overlay";
import { OpslaanSectie } from "@/components/OpslaanSectie";
import { useOpslaanBlokkade } from "@/hooks/useOpslaanBlokkade";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import {
  ONBEKENDE_UITKOMST_TEKST,
  OPSLAAN_BEZIG_TEKST,
  WACHT_OP_ANDERE_WIJZIGING_TEKST,
  isBezig,
  isKeuzeOnopgeslagen,
  isTekstOnopgeslagen,
} from "@/lib/opslaan";
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
 * (docs/features/auth-methode-per-lid.md, #42) — sinds
 * docs/features/portal-login.md → "Ledenkoppeling voor rol `lid`" (Besloten
 * door Bram, 2026-09-25, punt 1) zichtbaar voor élke rol, niet langer alleen
 * `bardienst`/`beheerder`: alleen de Pincode-regel blijft role-gated (een
 * `lid` heeft nooit een PIN, CLAUDE.md → "Dienst & bezetting"). Geen
 * bewerkbare selector: onder ADR 0005 is de enige schrijfactie (PIN aan/uit)
 * zelfbediening via `set_own_pin` ("Mijn account"), niet iets een beheerder
 * hier namens een ander lid doet — zie de spec → "Besloten door de
 * Architect" punt 3 voor waarom dat verschilt van een eerdere conceptspec.
 */
export function LidBeherenOverlay({
  member: initialMember,
  onClose,
  onChanged,
  onOpenOrders,
}: {
  member: LedenbeheerLid;
  onClose: () => void;
  onChanged: () => void;
  /** Wisselt naar "bestelling terugdraaien" voor dit lid
   *  (docs/features/bestelling-terugdraaien.md → Beheer). De ouder sluit
   *  deze overlay en opent die andere — nooit twee overlays tegelijk. */
  onOpenOrders: () => void;
}) {
  const [member, setMember] = useState(initialMember);
  const [nameInput, setNameInput] = useState(initialMember.name);
  const [emailInput, setEmailInput] = useState(initialMember.email ?? "");
  const [roleValue, setRoleValue] = useState<LedenbeheerLid["role"]>(
    initialMember.role
  );
  const [toast, setToast] = useState<string | null>(null);

  const nameMutation = useUpdateMemberName();
  const emailMutation = useUpdateMemberEmail();
  const roleMutation = useSetMemberRole();
  const archiveMutation = useSetMemberArchived();
  const inviteMutation = useSendMemberInvite();

  const nameId = useId();
  const emailId = useId();
  const roleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const roleSelectRef = useRef<HTMLSelectElement>(null);
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const archiveButtonRef = useRef<HTMLButtonElement>(null);
  const herstelFocus = useHerstelFocus();

  // Serialisatie per lid (docs/features/opslaan-sluiten-pending.md): één
  // schrijfactie tegelijk. Een late response kan zo een nieuwere niet meer
  // overschrijven, en elke sectie toont zijn eigen fout (F11): de fout van een
  // actie blijft staan tot die actie opnieuw start of de invoer wijzigt.
  const nameBusy = nameMutation.status === "pending";
  const emailBusy = emailMutation.status === "pending";
  const roleBusy = roleMutation.status === "pending";
  const archiveBusy = archiveMutation.status === "pending";
  const inviteBusy = inviteMutation.status === "pending";
  const busy = isBezig(nameBusy, emailBusy, roleBusy, archiveBusy, inviteBusy);
  const { closeBlocked, timedOut } = useOpslaanBlokkade(busy);
  const unsaved =
    isTekstOnopgeslagen(nameInput, member.name) ||
    isTekstOnopgeslagen(emailInput, member.email ?? "") ||
    isKeuzeOnopgeslagen(roleValue, member.role);

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
    trimmedName !== "" && trimmedName !== member.name && !busy;

  async function saveName() {
    if (!canSaveName) return;
    const updated = await nameMutation.updateMemberName(member.id, trimmedName);
    if (updated) {
      // Alleen het veld dat deze actie wijzigde; de rest van het lokale lid blijft.
      setMember((current) => ({ ...current, name: updated.name }));
      setNameInput(updated.name);
      onChanged();
      showToast("Naam bijgewerkt");
    } else if (nameMutation.errorCode === "member_not_found") {
      onChanged();
    }
    herstelFocus(nameInputRef.current);
  }

  const trimmedEmail = emailInput.trim();
  const currentEmail = member.email ?? "";
  const emailFormatValid = trimmedEmail === "" || isValidEmailFormat(trimmedEmail);
  const canSaveEmail =
    trimmedEmail !== currentEmail &&
    emailFormatValid &&
    !busy;

  async function saveEmail() {
    if (!canSaveEmail) return;
    const result = await emailMutation.updateMemberEmail(
      member.id,
      trimmedEmail === "" ? null : trimmedEmail
    );
    if (result.member) {
      const savedEmail = result.member.email;
      setMember((current) => ({ ...current, email: savedEmail }));
      setEmailInput(savedEmail ?? "");
      onChanged();
      showToast("E-mailadres bijgewerkt");
    } else if (result.errorCode === "member_not_found") {
      onChanged();
    }
    herstelFocus(emailInputRef.current);
  }

  const canSaveRole = roleValue !== member.role && !busy;

  async function saveRole() {
    if (!canSaveRole) return;
    const updated = await roleMutation.setMemberRole(member.id, roleValue);
    if (updated) {
      setMember((current) => ({ ...current, role: updated.role }));
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
    herstelFocus(roleSelectRef.current);
  }

  async function toggleArchived() {
    if (busy) return;
    const nextArchived = !member.archived;
    const updated = await archiveMutation.setMemberArchived(member.id, nextArchived);
    if (updated) {
      setMember((current) => ({ ...current, archived: updated.archived }));
      onChanged();
      showToast(`${updated.name} ${updated.archived ? "gearchiveerd" : "teruggezet"}`);
    } else if (archiveMutation.errorCode === "member_not_found") {
      onChanged();
    }
    herstelFocus(archiveButtonRef.current);
  }

  /** Alleen zichtbaar bij `member.email !== null` (spec → Schermflow stap
   *  2) — geen e-mailadres, geen invite-mogelijkheid. Disabled zodra
   *  `member.hasAccount` (spec → Architect-beslissingen → Zichtbaarheid). */
  async function sendInvite() {
    if (member.hasAccount || busy) return;
    const result = await inviteMutation.sendInvite(member.id);
    if (result.errorCode === null) {
      if (result.invited) {
        // (Herzien, PR #62-review, Bug 1-fix): alleen `invitedAt` verversen
        // — `hasAccount` blijft ongemoeid. Het lid heeft ná het versturen
        // van een invite nog steeds geen gekoppeld account; dat gebeurt pas
        // bij acceptatie (link_invited_member_account, /beheer/callback).
        // Een beheerder ziet `hasAccount` pas `true` worden nadat het lid de
        // link daadwerkelijk gebruikt heeft én de ledenlijst ververst wordt.
        setMember((current) => ({ ...current, invitedAt: result.invitedAt }));
        onChanged();
        showToast("Uitnodiging verstuurd");
      }
      // invited: false (niet eligible, spec → RPC's punt 3.3) is met de
      // huidige UI-gating (email !== null, sectie al role-gated) niet
      // bereikbaar buiten een race — geen toast/foutmelding hiervoor
      // gespecificeerd.
      herstelFocus(inviteButtonRef.current);
      return;
    }
    if (result.errorCode === "member_not_found" || result.errorCode === "already_linked") {
      onChanged();
    }
    herstelFocus(inviteButtonRef.current);
  }

  return (
    <Overlay
      title="Lid beheren"
      description={`Wijzigingen aan ${member.name}.`}
      onClose={onClose}
      closeBlocked={closeBlocked}
      onopgeslagen={unsaved}
    >
      <div aria-live="polite" role="status" className="empty:-mt-4">
        {toast && <p className="text-sm font-bold text-ink">{toast}</p>}
      </div>

      {timedOut && (
        <p className="text-sm font-bold text-danger" role="alert">
          {ONBEKENDE_UITKOMST_TEKST}
        </p>
      )}

      <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
          Saldo
        </span>
        <span className="text-sm font-extrabold text-ink">
          {formatCents(member.balanceCents)}
        </span>
      </div>

      <OpslaanSectie
        pending={nameBusy}
        wachtOpAnder={busy}
        fout={nameMutation.errorCode ? nameErrorMessage(nameMutation.errorCode) : null}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Naam wijzigen</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={nameId} className="sr-only">
            Naam
          </label>
          <input
            ref={nameInputRef}
            id={nameId}
            type="text"
            value={nameInput}
            readOnly={nameBusy}
            onChange={(event) => {
              setNameInput(event.target.value);
              if (nameMutation.errorCode) nameMutation.reset();
            }}
            className="h-11 flex-1 min-w-0 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!canSaveName}
            onClick={saveName}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            {nameBusy ? OPSLAAN_BEZIG_TEKST : "Opslaan"}
          </button>
        </div>
      </OpslaanSectie>

      <OpslaanSectie
        pending={emailBusy}
        wachtOpAnder={busy}
        fout={emailMutation.errorCode ? emailErrorMessage(emailMutation.errorCode) : null}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">E-mailadres</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={emailId} className="sr-only">
            E-mailadres
          </label>
          <input
            ref={emailInputRef}
            id={emailId}
            type="email"
            value={emailInput}
            readOnly={emailBusy}
            onChange={(event) => {
              setEmailInput(event.target.value);
              if (emailMutation.errorCode) emailMutation.reset();
            }}
            className="h-11 flex-1 min-w-0 rounded-control border border-border bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!canSaveEmail}
            onClick={saveEmail}
            className="flex h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
          >
            {emailBusy ? OPSLAAN_BEZIG_TEKST : "Opslaan"}
          </button>
        </div>
      </OpslaanSectie>

      <OpslaanSectie
        pending={roleBusy}
        wachtOpAnder={busy}
        fout={roleMutation.errorCode ? roleErrorMessage(roleMutation.errorCode) : null}
      >
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
            ref={roleSelectRef}
            id={roleId}
            value={roleValue}
            disabled={roleBusy}
            onChange={(event) => {
              setRoleValue(event.target.value as LedenbeheerLid["role"]);
              if (roleMutation.errorCode) roleMutation.reset();
            }}
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
            {roleBusy ? OPSLAAN_BEZIG_TEKST : "Opslaan"}
          </button>
        </div>
      </OpslaanSectie>

      {/* docs/features/portal-login.md → "Ledenkoppeling voor rol `lid`",
          Besloten door Bram punt 1: zichtbaar voor élke rol, niet langer
          alleen bardienst/beheerder — een beheerder kan zo ook een
          `lid`-rol member een magic-link-invite sturen (portal-login,
          eligibility uitgebreid in src/lib/inviteMember.ts). Voor
          `role === 'lid'` geen Pincode-regel (`has_pin` is een
          bardienst/beheerder-concept, CLAUDE.md → "Dienst & bezetting" —
          een lid heeft nooit een PIN), wel de Wachtwoordaccount-status +
          invite-knop, ongewijzigd gedrag verder. */}
      <OpslaanSectie
        pending={inviteBusy}
        wachtOpAnder={busy && member.email !== null && !member.hasAccount}
        fout={inviteMutation.errorCode ? inviteErrorMessage(inviteMutation.errorCode) : null}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Inloggegevens</span>
          {member.role !== "lid" && (
            <span className="text-xs font-medium text-muted">
              pincode is alleen-lezen — dit lid beheert &apos;m zelf via &quot;Mijn account&quot;
            </span>
          )}
        </div>
        <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
            Wachtwoordaccount
          </span>
          <span className="text-sm font-extrabold text-ink">
            {accountStatusText(member)}
          </span>
        </div>
        {member.role !== "lid" && (
          <div className="flex items-center justify-between rounded-control bg-canvas px-3.5 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Pincode
            </span>
            <span className="text-sm font-extrabold text-ink">
              {member.hasPin ? "ingesteld" : "niet ingesteld"}
            </span>
          </div>
        )}
        {member.email !== null && (
          <div className="flex flex-col gap-1.5">
            <button
              ref={inviteButtonRef}
              type="button"
              disabled={member.hasAccount || busy}
              onClick={sendInvite}
              className="flex h-11 w-full items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:bg-track disabled:text-muted"
            >
              {inviteBusy
                ? OPSLAAN_BEZIG_TEKST
                : member.invitedAt === null
                  ? "Invite versturen"
                  : "Invite opnieuw versturen"}
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
      </OpslaanSectie>

      <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={onOpenOrders}
        className="flex items-center justify-between gap-3 rounded-control border border-border p-3.5 text-left transition-colors hover:border-danger disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Bestelling terugdraaien</span>
          <span className="text-xs font-medium text-muted">
            het bedrag gaat terug naar het saldo, met een reden
          </span>
        </span>
        <span aria-hidden="true" className="text-base font-bold text-muted">
          ›
        </span>
      </button>
      {busy && (
        <p className="text-xs font-medium text-muted">{WACHT_OP_ANDERE_WIJZIGING_TEKST}</p>
      )}
      </div>

      <OpslaanSectie
        chrome={false}
        pending={archiveBusy}
        wachtOpAnder={busy}
        fout={archiveMutation.errorCode ? archiveErrorMessage(archiveMutation.errorCode) : null}
      >
      <button
        ref={archiveButtonRef}
        type="button"
        disabled={busy}
        onClick={toggleArchived}
        className="flex items-center justify-between gap-3 rounded-control border border-border p-3.5 text-left transition-colors hover:border-danger disabled:opacity-50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-danger">
            {archiveBusy
              ? OPSLAAN_BEZIG_TEKST
              : member.archived
                ? "Lid terugzetten"
                : "Lid archiveren"}
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
      </OpslaanSectie>

      <button
        type="button"
        disabled={closeBlocked}
        onClick={onClose}
        className="flex h-11 w-full items-center justify-center rounded-control border border-border bg-white text-sm font-bold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sluiten
      </button>
    </Overlay>
  );
}
