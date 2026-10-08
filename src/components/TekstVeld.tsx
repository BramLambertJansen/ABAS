"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { tekstVeldKlassen, type TekstVeldTone } from "./tekstVeldKlassen";

const MATEN = { "44": "h-control", "52": "h-control-lg" } as const;

/**
 * Label + tekstinvoer. `tone="rail"` (standaard) is de opmaak van de donkere
 * rail-schermen (`BeheerLogin`, `TabletKoppelen`); `tone="light"` die van de
 * lichte portal-sheets (`NaamWijzigenSheet`, #17). Alleen opmaak en de label-koppeling
 * (`htmlFor`/`id`, via `useId`): geen validatie, geen eigen state.
 * Een expliciete id blijft behouden. `maat` kiest de controlhoogte
 * (`h-control` 44px of `h-control-lg` 52px); prefix is decoratief, validatie blijft bij de
 * consument. `readOnly` blijft focusbaar; `disabled` verlaat de tabvolgorde.
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
  id: eigenId,
  maat,
  prefix,
  labelVerborgen = false,
  className = "",
  ...inputProps
}: {
  label: string;
  maat?: keyof typeof MATEN;
  prefix?: ReactNode;
  labelVerborgen?: boolean;
  /** Alleen de veldgroep/layout; inputpresentatie komt uit tone/maat. */
  className?: string;
  tone?: TekstVeldTone;
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
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "prefix">) {
  const automatischId = useId();
  const id = eigenId ?? automatischId;
  const foutId = `${id}-fout`;
  const hintId = `${id}-hint`;
  const beschrijving =
    [describedBy, hint ? hintId : null, fout ? foutId : null].filter(Boolean).join(" ") ||
    undefined;
  const klassen = tekstVeldKlassen(tone);
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelVerborgen ? "sr-only" : klassen.label}>
        {label}
      </label>
      {prefix ? (
        <div className={`flex min-w-0 items-center gap-2 rounded-control border px-3.5 focus-within:border-accent ${tone === "rail" ? "border-rail-border bg-rail" : "border-border bg-surface"}`}>
          <span aria-hidden="true" className={klassen.prefix}>{prefix}</span>
          <input ref={inputRef} id={id} {...inputProps}
            aria-invalid={fout ? true : inputProps["aria-invalid"]}
            aria-describedby={beschrijving}
            className={`${MATEN[maat ?? "44"]} min-w-0 flex-1 bg-transparent text-sm font-semibold outline-hidden ${tone === "rail" ? "text-white" : "text-ink"} ${tekstVeldKlassen(tone).placeholder}`} />
        </div>
      ) : (
        <input ref={inputRef} id={id} {...inputProps}
          aria-invalid={fout ? true : inputProps["aria-invalid"]}
          aria-describedby={beschrijving}
          className={maat
            ? `${MATEN[maat]} rounded-control border px-3.5 text-sm font-semibold outline-hidden focus:border-accent ${tone === "rail" ? "border-rail-border bg-rail text-white" : "border-border bg-surface text-ink"} ${tekstVeldKlassen(tone).placeholder}`
            : `${klassen.input} ${tekstVeldKlassen(tone).placeholder}`} />
      )}
      {hint && (
        <p id={hintId} className={klassen.hint}>
          {hint}
        </p>
      )}
      <VeldFout id={foutId} tone={tone} tekst={fout} alert={foutAlert} />
      {children}
    </div>
  );
}

/**
 * De veldmelding zelf (foutstijl uit `tekstVeldKlassen(tone).fout`; `tone`
 * standaard `"light"`, `"rail"` voor de donkere rail),
 * gedeeld door `TekstVeld` en de invoervelden met een eigen opmaak (bedrag met
 * €-voorvoegsel, veld naast een knop): één melding-element, één koppelpatroon
 * (`aria-describedby` naar `id`). `alert` gebruikt `role="alert"` en remount
 * bij de wissel, zodat een schermlezer de poging-melding voorleest.
 */
export function VeldFout({
  id,
  tekst,
  alert = false,
  tone = "light",
}: {
  id: string;
  tekst?: string | null;
  alert?: boolean;
  tone?: TekstVeldTone;
}) {
  if (!tekst) return null;
  return (
    <p
      key={alert ? "alert" : "stil"}
      id={id}
      role={alert ? "alert" : undefined}
      className={tekstVeldKlassen(tone).fout}
    >
      {tekst}
    </p>
  );
}
