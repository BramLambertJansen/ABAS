import type { ReactNode } from "react";

/**
 * Het "A"-merkteken + "AURORA MUZIEKVERENIGING" boven de losstaande
 * schermen (inloggen, modus-keuze, dienst starten, wachtwoord herstellen).
 * `tone="dark"` voor de donkere rail-achtergrond van DienstStarten.
 * Optionele `children` komen eronder, meestal de `h1` van het scherm.
 */
export function AuroraMerk({
  tone = "light",
  children,
}: {
  tone?: "light" | "dark";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-extrabold text-white shadow-[0_10px_26px_-6px_rgba(238,90,36,0.7)]">
        A
      </div>
      <span
        className={`text-[10.5px] font-bold tracking-[0.15em] ${
          tone === "dark" ? "text-rail-muted" : "text-muted"
        }`}
      >
        AURORA MUZIEKVERENIGING
      </span>
      {children}
    </div>
  );
}
