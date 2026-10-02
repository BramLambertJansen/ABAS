"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

const TONES = {
  rail: {
    label: "text-xs font-bold text-rail-muted",
    input:
      "h-[52px] rounded-[15px] border border-rail-border bg-rail px-4 text-sm font-semibold text-white outline-none focus:border-accent",
  },
  light: {
    label: "text-xs font-bold text-muted",
    input:
      "h-[54px] rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-accent",
  },
} as const;

/**
 * Label + tekstinvoer. `tone="rail"` (standaard) is de opmaak van de donkere
 * rail-schermen (`BeheerLogin`, `TabletKoppelen`); `tone="light"` die van de
 * lichte portal-sheets (`NaamWijzigenSheet`, #17). Alleen opmaak en de label-koppeling
 * (`htmlFor`/`id`, via `useId`): geen validatie, geen eigen state. Alle
 * gewone input-attributen gaan ongewijzigd door naar de `<input>`.
 * `children` komen onder het veld, binnen dezelfde groep (bv. de
 * "Wachtwoord vergeten?"-knop). Uit `BeheerLogin.tsx` getild toen het
 * koppelscherm de tweede plek werd (docs/features/tablet-koppelen.md →
 * Schermflow → Hergebruik).
 */
export function TekstVeld({
  label,
  inputRef,
  children,
  tone = "rail",
  fout,
  foutAlert = false,
  hint,
  "aria-describedby": describedBy,
  ...inputProps
}: {
  label: string;
  tone?: keyof typeof TONES;
  inputRef?: Ref<HTMLInputElement>;
  children?: ReactNode;
  /** Veldmelding onder het veld; de aanroeper bepaalt wanneer die getoond
   *  wordt (bij blur of een poging, docs/features/invoerfeedback-zoeken-filters.md).
   *  Zet `aria-invalid` en `aria-describedby`. */
  fout?: string | null;
  /** `role="alert"`: alleen voor de fout na een tik op de primaire knop. */
  foutAlert?: boolean;
  /** Vaste uitleg onder het veld, ook als er geen fout is. */
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">) {
  const id = useId();
  const foutId = `${id}-fout`;
  const hintId = `${id}-hint`;
  const beschrijving =
    [describedBy, hint ? hintId : null, fout ? foutId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={TONES[tone].label}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        {...inputProps}
        aria-invalid={fout ? true : inputProps["aria-invalid"]}
        aria-describedby={beschrijving}
        className={TONES[tone].input}
      />
      {hint && (
        <p id={hintId} className="text-xs font-semibold text-muted">
          {hint}
        </p>
      )}
      <VeldFout id={foutId} tekst={fout} alert={foutAlert} />
      {children}
    </div>
  );
}

/**
 * De veldmelding zelf (bestaande foutstijl: `text-xs font-bold text-danger`),
 * gedeeld door `TekstVeld` en de invoervelden met een eigen opmaak (bedrag met
 * €-voorvoegsel, veld naast een knop): één melding-element, één koppelpatroon
 * (`aria-describedby` naar `id`). `alert` gebruikt `role="alert"` en remount
 * bij de wissel, zodat een schermlezer de poging-melding voorleest.
 */
export function VeldFout({
  id,
  tekst,
  alert = false,
}: {
  id: string;
  tekst?: string | null;
  alert?: boolean;
}) {
  if (!tekst) return null;
  return (
    <p
      key={alert ? "alert" : "stil"}
      id={id}
      role={alert ? "alert" : undefined}
      className="text-xs font-bold text-danger"
    >
      {tekst}
    </p>
  );
}
