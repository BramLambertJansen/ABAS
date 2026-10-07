import {
  VERVERS_TEKSTEN,
  bijgewerktLabel,
  verversMisluktTekst,
} from "@/lib/verversen";

/**
 * "Bijgewerkt om 14:32" plus de knop "Verversen" (docs/features/
 * leesfouten-herstel-actuele-data.md → Gedeelde onderdelen 5). Bovenaan een
 * portalscherm met data. Bezig: "Bezig met verversen…" en de knop is
 * `aria-disabled` (niet `disabled`, de focus blijft op de knop); de knop
 * blijft altijd gemount, dus een focushersteller is niet nodig. Mislukt een
 * verversing, dan blijven de gegevens staan en meldt de regel dat, met
 * `role="status"` (beleefd): de data blijft bruikbaar, dus geen `alert`.
 * `message` is de klasse-tekst (verbinding of serverkant) van de mislukking.
 * Het tijdstip is de klok van het apparaat, in Amsterdamse tijd.
 */
export function VerversStatus({
  bijgewerktOp,
  bezig,
  mislukt,
  message,
  onVerversen,
}: {
  bijgewerktOp: number | null;
  bezig: boolean;
  mislukt: boolean;
  message?: string | null;
  onVerversen: () => void;
}) {
  const label = bijgewerktLabel(bijgewerktOp);
  const regel = bezig
    ? VERVERS_TEKSTEN.verversenBezig
    : mislukt
      ? [verversMisluktTekst(bijgewerktOp), message].filter(Boolean).join(" ")
      : label;

  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-3">
      <p role="status" className={`text-xs font-semibold ${mislukt && !bezig ? "text-danger" : "text-muted"}`}>
        {regel}
      </p>
      <button
        type="button"
        aria-disabled={bezig}
        onClick={() => {
          if (!bezig) onVerversen();
        }}
        className="flex min-h-control max-w-full flex-none items-center rounded-control border border-border bg-surface px-4 text-xs font-extrabold text-ink transition-colors hover:border-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        {VERVERS_TEKSTEN.verversen}
      </button>
    </div>
  );
}
