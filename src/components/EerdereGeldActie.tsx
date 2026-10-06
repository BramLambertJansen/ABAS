"use client";

import { usePendingMoneyRequests } from "@/hooks/queries/usePendingMoneyRequests";

const names = { place_order: "bestelling", top_up: "opwaardering", create_member: "nieuw lid" };
/** Persisted requests can be recovered after a reload without retyping a cart. */
export function EerdereGeldActie() {
  const requests = usePendingMoneyRequests();
  if (!requests.pending.length && !requests.error) return null;
  return (
    <section aria-label="Eerdere geldacties" className="mx-4 my-3 flex max-w-xl flex-col gap-2 rounded-xl border border-border bg-warning-bg p-4 text-warning-fg shadow-lg sm:mx-auto">
      <p className="text-sm font-bold" role="status">Een eerdere actie heeft nog geen bevestigde uitkomst.</p>
      <p className="text-sm">Is de actie al verwerkt, dan blijft die bestaan. Annuleren draait geen boeking terug.</p>
      {requests.pending.map(({ operation }) => (
        <div key={operation} className="flex flex-wrap gap-2">
        <button type="button" disabled={requests.busy}
          className="min-h-11 rounded-control border border-border bg-white px-4 text-sm font-bold text-ink disabled:opacity-50"
          onClick={async () => { if (await requests.recover(operation)) window.location.reload(); }}>
          {requests.busy ? "Bezig met controleren…" : `Eerdere ${names[operation]} veilig afronden`}
        </button>
        <button type="button" disabled={requests.busy}
          className="min-h-11 rounded-control border border-border bg-white px-4 text-sm font-bold text-ink disabled:opacity-50"
          onClick={async () => { if (await requests.recover(operation, true)) window.location.reload(); }}>
          Eerdere {names[operation]} definitief annuleren
        </button>
        </div>
      ))}
      {requests.error && <p role="alert" className="text-sm">{requests.error}</p>}
    </section>
  );
}
