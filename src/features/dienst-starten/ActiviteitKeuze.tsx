"use client";

import { useId } from "react";
import type { ActiviteitType } from "@/hooks/queries/useActiviteitTypes";

/**
 * Stap tussen stafkeuze en PIN-invoer in `DienstStarten.tsx` — een dienst
 * kiest, verplicht, één activiteittype. Zie
 * docs/features/activiteittypes.md → Schermflow §2. Volledige-schermstap
 * binnen de bestaande donkere PIN-flow, geen overlay (spec →
 * `useShell()`-contract): één `<select>`, geen lijst kandidaten die
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
  const selectId = useId();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const activityType = activityTypes.find((a) => a.id === event.target.value);
    if (activityType) onSelect(activityType);
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-5">
      <p className="text-sm font-bold text-white">{staffName}</p>

      <h1 className="text-center text-xl font-extrabold tracking-tight text-white">
        Voor welke activiteit is deze dienst?
      </h1>

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
        <div className="flex w-full flex-col gap-1.5">
          <label htmlFor={selectId} className="sr-only">
            Activiteit
          </label>
          {/* Rand kleurt via `border-rail-error` zolang er een fout is
              (race: type gearchiveerd tussen kiezen en PIN bevestigen) —
              zelfde soort verplicht-markering als het ontwerp
              (chat37.md: oranje rand zolang niets gekozen is). */}
          <select
            id={selectId}
            value=""
            disabled={pending}
            onChange={handleChange}
            aria-invalid={errorMessage ? true : undefined}
            className={`h-12 w-full rounded-2xl border bg-rail-card px-3.5 text-sm font-semibold text-white outline-none disabled:opacity-50 ${
              errorMessage
                ? "border-rail-error"
                : "border-rail-border focus:border-accent"
            }`}
          >
            <option value="" disabled>
              Kies een activiteit…
            </option>
            {activityTypes.map((activityType) => (
              <option key={activityType.id} value={activityType.id}>
                {activityType.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="h-5 text-sm font-bold text-rail-error" role="alert">
        {errorMessage ?? ""}
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={onBack}
        className="text-xs font-semibold text-rail-muted hover:text-white disabled:opacity-50"
      >
        ← andere bardienst
      </button>
    </div>
  );
}
