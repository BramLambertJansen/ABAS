"use client";

import { Select } from "@/components/Select";
import { StaffHeader } from "./StaffHeader";
import type { ActiviteitType } from "@/hooks/queries/useActiviteitTypes";

/**
 * Stap tussen stafkeuze en PIN-invoer in `DienstStarten.tsx` — een dienst
 * kiest, verplicht, één activiteittype. Zie
 * docs/features/activiteittypes.md → Schermflow §2. Volledige-schermstap
 * binnen de bestaande donkere PIN-flow, geen overlay (spec →
 * `useShell()`-contract): één dropdown (`Select`), geen lijst kandidaten die
 * `useShell().columns` nodig heeft.
 */
export function ActiviteitKeuze({
  staffName,
  activityTypes,
  loading,
  loadErrorMessage,
  errorMessage,
  pending,
  onSelect,
  onBack,
}: {
  staffName: string;
  activityTypes: ActiviteitType[];
  loading: boolean;
  loadErrorMessage: string | null;
  errorMessage: string | null;
  pending: boolean;
  onSelect: (activityType: ActiviteitType) => void;
  onBack: () => void;
}) {
  function handleChange(id: string) {
    const activityType = activityTypes.find((a) => a.id === id);
    if (activityType) onSelect(activityType);
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-5">
      <StaffHeader name={staffName} />

      <h2 className="text-center text-lg font-extrabold tracking-tight text-white">
        Voor welke activiteit is deze dienst?
      </h2>

      {loading && (
        <p className="text-sm font-semibold text-rail-muted" role="status">
          Activiteittypes laden…
        </p>
      )}

      {!loading && loadErrorMessage && (
        <p className="max-w-xs text-center text-sm font-semibold text-rail-error" role="alert">
          {loadErrorMessage}
        </p>
      )}

      {!loading && !loadErrorMessage && activityTypes.length === 0 && (
        <p className="max-w-xs text-center text-sm font-semibold text-rail-error" role="alert">
          Geen actieve activiteittypes — vraag een beheerder er een toe te
          voegen.
        </p>
      )}

      {!loading && !loadErrorMessage && activityTypes.length > 0 && (
        // Rand kleurt via `invalid` zolang er een fout is (race: type
        // gearchiveerd tussen kiezen en PIN bevestigen) — zelfde soort
        // verplicht-markering als het ontwerp (chat37.md: oranje rand zolang
        // niets gekozen is).
        <Select
          label="Activiteit"
          placeholder="Kies een activiteit…"
          options={activityTypes.map((a) => ({ value: a.id, label: a.name }))}
          value={null}
          disabled={pending}
          invalid={errorMessage !== null}
          onChange={handleChange}
        />
      )}

      <p className="h-5 text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={onBack}
        className="text-xs font-semibold text-rail-muted hover:text-rail-light disabled:opacity-50"
      >
        ← andere bardienst
      </button>
    </div>
  );
}
