"use client";

import { ZoekIcoon } from "@/components/ZoekIcoon";

/**
 * Zoekveld met loep-icoon en een sr-only label, uit `LedenLijst` getild
 * (docs/features/beheerformulieren-catalogus.md, besluit 10). Gebruikt door
 * de beheerlijsten (Leden, Assortiment). Andere zoekvelden met een andere
 * maat of tekst blijven eigen varianten.
 */
export function ZoekVeld({
  id,
  label,
  waarde,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  waarde: string;
  onChange: (waarde: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex flex-none items-center">
      <ZoekIcoon className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        value={waarde}
        onChange={(event) => onChange(event.target.value)}
        className="h-control-lg w-full rounded-control border border-border bg-surface pl-[46px] pr-[18px] text-[14.5px] font-medium text-ink focus-visible:outline-hidden placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
      />
    </div>
  );
}
