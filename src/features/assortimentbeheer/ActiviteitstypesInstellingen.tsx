"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LeesFout } from "@/components/LeesFout";
import { useHerstelFocus } from "@/hooks/useHerstelFocus";
import { useLeesHerstel } from "@/hooks/useLeesHerstel";
import {
  useAlleActiviteitTypes,
  type AlleActiviteitType,
} from "@/hooks/queries/useAlleActiviteitTypes";
import {
  useCreateActivityType,
  type CreateActivityTypeErrorCode,
} from "@/hooks/queries/useCreateActivityType";
import {
  useUpdateActivityTypeName,
  type UpdateActivityTypeNameErrorCode,
} from "@/hooks/queries/useUpdateActivityTypeName";
import {
  useSetActivityTypeArchived,
  type SetActivityTypeArchivedErrorCode,
} from "@/hooks/queries/useSetActivityTypeArchived";
import { isLaatsteActieveType } from "./laatsteActieveType";

type LastAction = "create" | "rename" | "archive" | null;

function createErrorMessage(code: CreateActivityTypeErrorCode): string {
  switch (code) {
    case "invalid_name":
      return "vul een naam in";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan activiteittypes niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

function updateNameErrorMessage(code: UpdateActivityTypeNameErrorCode): string {
  switch (code) {
    case "activity_type_not_found":
      return "dit activiteittype bestaat niet meer — de lijst is bijgewerkt";
    case "invalid_name":
      return "vul een naam in";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan activiteittypes niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

function archivedErrorMessage(code: SetActivityTypeArchivedErrorCode): string {
  switch (code) {
    case "activity_type_not_found":
      return "dit activiteittype bestaat niet meer — de lijst is bijgewerkt";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — vraag een beheerder";
    case "no_admin_role":
      return "dit account kan activiteittypes niet beheren — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/**
 * "Activiteitstypes"-kaart in de Instellingen-tab — naast (niet in plaats
 * van) `NegatieveLimietInstellingen`. Zie
 * docs/features/activiteittypes.md → Schermflow §1. Geen "x in
 * gebruik"-teller. De "geen actief type meer"-waarschuwing (inline bevestiging
 * bij het laatste actieve type, vaste melding bij nul actief) is erbij
 * gekomen met docs/features/beheerformulieren-catalogus.md, besluit 9: een
 * waarschuwing met hersteloptie, geen hard verbod.
 */
export function ActiviteitstypesInstellingen() {
  const types = useAlleActiviteitTypes();
  const kopRef = useRef<HTMLHeadingElement>(null);
  const herstel = useLeesHerstel(types, kopRef);
  const createMutation = useCreateActivityType();
  const updateNameMutation = useUpdateActivityTypeName();
  const archivedMutation = useSetActivityTypeArchived();

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null
  );
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const newNameId = useId();
  const newNameRef = useRef<HTMLInputElement>(null);
  const archiveRefs = useRef(new Map<string, HTMLButtonElement>());
  const annulerenRef = useRef<HTMLButtonElement>(null);
  const waarschuwingId = useId();
  const herstelFocus = useHerstelFocus();
  // Na een geslaagde archive/herstel ververst de lijst en unmount de rij met
  // de knop (status `loading`). De doel-id wacht tot de lijst weer `ready` is.
  const focusNaVerversen = useRef<{ id: string; ladingGezien: boolean } | null>(null);
  // Het type waarvoor de "laatste actieve"-waarschuwing openstaat.
  const [bevestig, setBevestig] = useState<string | null>(null);
  const editNameId = useId();

  const creating = createMutation.status === "pending";
  const renaming = updateNameMutation.status === "pending";
  const archiving = archivedMutation.status === "pending";

  async function createType() {
    if (newName.trim() === "" || creating) return;
    setLastAction("create");
    const created = await createMutation.createActivityType(newName);
    if (created) {
      setNewName("");
      types.refetch();
    }
  }

  function startEdit(type: AlleActiviteitType) {
    setEditing({ id: type.id, name: type.name });
    setLastAction(null);
    updateNameMutation.reset();
  }

  function cancelEdit() {
    setEditing(null);
    updateNameMutation.reset();
  }

  async function saveEdit() {
    if (!editing || editing.name.trim() === "" || renaming) return;
    setLastAction("rename");
    const updated = await updateNameMutation.updateActivityTypeName(
      editing.id,
      editing.name
    );
    if (updated) {
      setEditing(null);
      types.refetch();
    }
  }

  const alleTypes = types.status === "ready" ? types.activityTypes : [];
  const geenActief =
    types.status === "ready" && alleTypes.length > 0 && alleTypes.every((t) => t.archived);
  const bevestigType = bevestig ? alleTypes.find((t) => t.id === bevestig) : undefined;
  const toonWaarschuwing =
    bevestigType !== undefined && isLaatsteActieveType(alleTypes, bevestigType.id);

  useEffect(() => {
    const wacht = focusNaVerversen.current;
    if (!wacht) return;
    if (types.status === "loading") {
      wacht.ladingGezien = true;
    } else if (wacht.ladingGezien) {
      focusNaVerversen.current = null;
      if (types.status === "ready") herstelFocus(archiveRefs.current.get(wacht.id) ?? null);
    }
  }, [types.status, herstelFocus]);

  // Focus naar de veilige keuze als de waarschuwing opent.
  useEffect(() => {
    if (toonWaarschuwing) annulerenRef.current?.focus();
  }, [toonWaarschuwing]);

  function vraagArchiveren(type: AlleActiviteitType) {
    if (archiving) return;
    if (!type.archived && isLaatsteActieveType(alleTypes, type.id)) {
      setBevestig(type.id);
      return;
    }
    void toggleArchived(type);
  }

  function annuleerWaarschuwing(id: string) {
    setBevestig(null);
    herstelFocus(archiveRefs.current.get(id) ?? null);
  }

  async function toggleArchived(type: AlleActiviteitType) {
    if (archiving) return;
    setBevestig(null);
    setLastAction("archive");
    const updated = await archivedMutation.setActivityTypeArchived(
      type.id,
      !type.archived
    );
    if (updated) {
      focusNaVerversen.current = { id: type.id, ladingGezien: false };
      types.refetch();
    } else {
      herstelFocus(archiveRefs.current.get(type.id) ?? null);
    }
  }

  const errorMessage =
    lastAction === "create" && createMutation.errorCode
      ? createErrorMessage(createMutation.errorCode)
      : lastAction === "rename" && updateNameMutation.errorCode
        ? updateNameErrorMessage(updateNameMutation.errorCode)
        : lastAction === "archive" && archivedMutation.errorCode
          ? archivedErrorMessage(archivedMutation.errorCode)
          : null;

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 ref={kopRef} tabIndex={-1} className="text-base font-extrabold tracking-tight">
          Activiteitstypes
        </h2>
        <p className="text-xs font-semibold text-muted">
          Elke dienst wordt gestart voor één van deze activiteiten. Bewerk of
          archiveer een type, of voeg een nieuwe toe.
        </p>
      </div>

      <p className="text-sm font-bold text-danger empty:-mt-4" role="alert">
        {errorMessage ?? ""}
      </p>

      {geenActief && (
        <p className="rounded-control border border-border bg-canvas p-3 text-sm font-bold text-ink" role="status">
          Er is geen actief activiteitstype. Er kan geen dienst worden gestart. Herstel een type hieronder of voeg een nieuw type toe.
        </p>
      )}

      {types.status === "loading" && !herstel.toonFout && (
        <p className="text-sm font-semibold text-muted" role="status">
          Activiteitstypes laden…
        </p>
      )}

      {herstel.toonFout && (
        <LeesFout
          tone="light"
          className="items-start text-left"
          message={herstel.message}
          onRetry={herstel.retry}
          bezig={herstel.bezig}
        />
      )}

      {types.status === "ready" && types.activityTypes.length === 0 && (
        <p className="text-sm font-semibold text-muted">
          Nog geen activiteittypes — voeg het eerste toe.
        </p>
      )}

      {types.status === "ready" && types.activityTypes.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-card border border-border bg-surface p-2">
          {types.activityTypes.map((type) => (
            <li key={type.id}>
              {editing?.id === type.id ? (
                <div className="flex items-center gap-2 px-1.5 py-1.5">
                  <label htmlFor={editNameId} className="sr-only">
                    Naam van {type.name}
                  </label>
                  <input
                    id={editNameId}
                    type="text"
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ id: type.id, name: event.target.value })
                    }
                    className="h-control flex-1 min-w-0 rounded-control border border-border px-3 text-sm font-semibold text-ink focus-visible:outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <button
                    type="button"
                    disabled={renaming || editing.name.trim() === ""}
                    onClick={saveEdit}
                    className="flex h-control flex-none items-center justify-center rounded-control bg-accent px-3 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
                  >
                    Opslaan
                  </button>
                  <button
                    type="button"
                    disabled={renaming}
                    onClick={cancelEdit}
                    className="flex h-control flex-none items-center justify-center rounded-control border border-border px-3 text-xs font-bold text-ink transition-colors hover:border-accent disabled:opacity-50"
                  >
                    Annuleren
                  </button>
                </div>
              ) : (
                <div className="flex min-h-control items-center justify-between gap-3 px-3.5 py-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`truncate text-sm font-bold ${
                        type.archived ? "text-muted" : "text-ink"
                      }`}
                    >
                      {type.name}
                    </span>
                    {type.archived && (
                      <span className="flex-none rounded-full border border-border bg-canvas px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                        Gearchiveerd
                      </span>
                    )}
                  </span>
                  <span className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(type)}
                      aria-label={`${type.name} bewerken`}
                      className="flex h-control items-center justify-center rounded-control border border-border bg-surface px-2.5 text-xs font-bold text-ink transition-colors hover:border-accent"
                    >
                      <span aria-hidden="true">✎</span>
                      <span className="ml-1">bewerken</span>
                    </button>
                    <button
                      ref={(el) => {
                        if (el) archiveRefs.current.set(type.id, el);
                        else archiveRefs.current.delete(type.id);
                      }}
                      type="button"
                      disabled={archiving}
                      onClick={() => vraagArchiveren(type)}
                      aria-label={
                        type.archived
                          ? `${type.name} herstellen`
                          : `${type.name} archiveren`
                      }
                      className={`flex h-control items-center justify-center rounded-control border px-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        type.archived
                          ? "border-border bg-surface text-ink hover:border-accent"
                          : "border-border bg-surface text-danger hover:border-danger"
                      }`}
                    >
                      {type.archived ? "herstellen" : "archiveren"}
                    </button>
                  </span>
                </div>
              )}
              {toonWaarschuwing && bevestigType?.id === type.id && (
                <div
                  role="group"
                  aria-labelledby={waarschuwingId}
                  className="mx-1.5 mb-1.5 flex flex-col gap-3 rounded-control border border-border bg-canvas p-3.5"
                >
                  <p id={waarschuwingId} className="text-sm font-bold text-ink">
                    Dit is het laatste actieve activiteitstype. Zonder actief type kan niemand een dienst starten.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      ref={annulerenRef}
                      type="button"
                      onClick={() => annuleerWaarschuwing(type.id)}
                      className="flex h-control items-center justify-center rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover"
                    >
                      Annuleren
                    </button>
                    <button
                      type="button"
                      disabled={archiving}
                      onClick={() => {
                        setBevestig(null);
                        newNameRef.current?.focus();
                      }}
                      className="flex h-control items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-bold text-ink transition-colors hover:border-ink disabled:opacity-50"
                    >
                      Eerst een type toevoegen
                    </button>
                    <button
                      type="button"
                      disabled={archiving}
                      onClick={() => toggleArchived(type)}
                      className="flex h-control items-center justify-center rounded-control border border-danger bg-surface px-4 text-sm font-bold text-danger transition-colors hover:bg-canvas disabled:opacity-50"
                    >
                      Toch archiveren
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="h-px bg-border-subtle" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={newNameId} className="text-xs font-bold text-muted">
          Nieuw activiteitstype
        </label>
        <div className="flex gap-2">
          <input
            ref={newNameRef}
            id={newNameId}
            type="text"
            placeholder="bijv. Repetitie"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="h-control flex-1 min-w-0 rounded-control border border-border px-3.5 text-sm font-semibold text-ink focus-visible:outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            disabled={creating || newName.trim() === ""}
            onClick={createType}
            className="flex h-control flex-none items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-track disabled:text-muted"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}
