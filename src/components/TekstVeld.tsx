"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

/**
 * Label + tekstinvoer in de opmaak van de donkere rail-schermen
 * (`BeheerLogin`, `TabletKoppelen`). Alleen opmaak en de label-koppeling
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
  ...inputProps
}: {
  label: string;
  inputRef?: Ref<HTMLInputElement>;
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-rail-muted">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        {...inputProps}
        className="h-[52px] rounded-[15px] border border-rail-border bg-rail px-4 text-sm font-semibold text-white outline-none focus:border-accent"
      />
      {children}
    </div>
  );
}
