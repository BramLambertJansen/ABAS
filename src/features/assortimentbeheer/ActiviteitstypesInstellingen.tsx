"use client";

import { useId, useState } from "react";
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
 * gebruik"-teller, geen "geen actief type meer"-waarschuwing — beide
 * expliciet buiten scope (spec → Schermflow §1).
 */
export function ActiviteitstypesInstellingen() {
  const types = useAlleActiviteitTypes();
  const createMutation = useCreateActivityType();
  const updateNameMutation = useUpdateActivityTypeName();
  const archivedMutation = useSetActivityTypeArchived();

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null
  );
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const newNameId = useId();
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

  async function toggleArchived(type: AlleActiviteitType) {
    if (archiving) return;
    setLastAction("archive");
    const updated = await archivedMutation.setActivityTypeArchived(
      type.id,
      !type.archived
    );
    if (updated) {
      types.refetch();
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
    <div className="flex max-w-md flex-col gap-4 rounded-card border border-border bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-extrabold tracking-tight">
          Activiteitstypes
        </h2>
        <p className="text-xs font-semibold text-muted">
          Elke dienst wordt gestart voor één van deze activiteiten. Bewerk of
          archiveer een type, of voeg een nieuwe toe.
        </p>
      </div>

      <p className="min-h-[1.25rem] text-sm font-bold text-danger" role="alert">
        {errorMessage ?? ""}
      </p>

      {types.status === "loading" && (
        <p className="text-sm font-semibold text-muted" role="status">
          Activiteitstypes laden…
        </p>
      )}

      {types.status === "error" && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {types.message}
        </p>
      )}

      {types.status === "ready" && types.activityTypes.length === 0 && (
        <p className="text-sm font-semibold text-muted">
          Nog geen activiteittypes — voeg het eerste toe.
        </p>
      )}

      {types.status === "ready" && types.activityTypes.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-2">
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
                    className="h-10 flex-1 min-w-0 rounded-control border border-border px-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <button
                    type="button"
                    disabled={renaming || editing.name.trim() === ""}
                    onClick={saveEdit}
                    className="flex h-10 flex-none items-center justify-center rounded-control bg-accent px-3 text-xs font-bold text-rail transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Opslaan
                  </button>
                  <button
                    type="button"
                    disabled={renaming}
                    onClick={cancelEdit}
                    className="flex h-10 flex-none items-center justify-center rounded-control border border-border px-3 text-xs font-bold text-ink transition-colors hover:border-accent disabled:opacity-50"
                  >
                    Annuleren
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[44px] items-center justify-between gap-3 px-3.5 py-2">
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
                      className="flex h-9 items-center justify-center rounded-control border border-border bg-white px-2.5 text-xs font-bold text-ink transition-colors hover:border-accent"
                    >
                      <span aria-hidden="true">✎</span>
                      <span className="ml-1">bewerken</span>
                    </button>
                    <button
                      type="button"
                      disabled={archiving}
                      onClick={() => toggleArchived(type)}
                      aria-label={
                        type.archived
                          ? `${type.name} herstellen`
                          : `${type.name} archiveren`
                      }
                      className={`flex h-9 items-center justify-center rounded-control border px-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        type.archived
                          ? "border-border bg-white text-ink hover:border-accent"
                          : "border-border bg-white text-danger hover:border-danger"
                      }`}
                    >
                      {type.archived ? "herstellen" : "archiveren"}
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="h-px bg-border-subtle" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={newNameId} className="text-xs font-bold text-muted">
          Nieuw activiteittype
        </label>
        <div className="flex gap-2">
          <input
            id={newNameId}
            type="text"
            placeholder="bijv. Repetitie"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="h-11 flex-1 min-w-0 rounded-control border border-border px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            disabled={creating || newName.trim() === ""}
            onClick={createType}
            className="flex h-11 flex-none items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-bold text-rail transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
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
