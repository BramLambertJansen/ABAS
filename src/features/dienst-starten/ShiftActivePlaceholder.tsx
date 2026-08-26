import type { OpenShift } from "@/hooks/queries/useOpenShift";

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Placeholder only — bezetting beheren (#7), verkoopscherm (#8) en dienst
 * afsluiten (#12) bestaan nog niet. Zie docs/features/dienst-starten.md.
 */
export function ShiftActivePlaceholder({ shift }: { shift: OpenShift }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-lg text-white"
      >
        ✓
      </span>
      <h2 className="text-lg font-extrabold text-white">Dienst actief</h2>
      <p className="max-w-xs text-sm font-medium text-rail-muted">
        Gestart door {shift.startedByName} om {formatStartedAt(shift.startedAt)}.
      </p>
      <p className="max-w-xs text-xs font-medium text-rail-muted">
        Verkoop, bezetting en dienst afsluiten volgen in latere schermen.
      </p>
    </div>
  );
}
