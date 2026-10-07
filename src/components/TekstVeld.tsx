"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

const TONES = {
  rail: {
    label: "text-xs font-bold text-rail-muted",
    input:
      "h-[52px] rounded-[15px] border border-rail-border bg-rail px-4 text-sm font-semibold text-white ui-field-focus",
  },
  light: {
    label: "text-xs font-bold text-muted",
    input:
      "h-[54px] rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink ui-field-focus",
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
  ...inputProps
}: {
  label: string;
  tone?: keyof typeof TONES;
  inputRef?: Ref<HTMLInputElement>;
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={TONES[tone].label}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        {...inputProps}
        className={TONES[tone].input}
      />
      {children}
    </div>
  );
}
