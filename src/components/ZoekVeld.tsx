"use client";

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
      <svg
        width="17"
        height="17"
        viewBox="0 0 17 17"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2"
      >
        <circle cx="7.2" cy="7.2" r="5" stroke="#aca69e" strokeWidth="1.7" />
        <line x1="11" y1="11" x2="15" y2="15" stroke="#aca69e" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        value={waarde}
        onChange={(event) => onChange(event.target.value)}
        className="h-[52px] w-full rounded-[14px] border border-border bg-white pl-[46px] pr-[18px] text-[14.5px] font-medium text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
      />
    </div>
  );
}
