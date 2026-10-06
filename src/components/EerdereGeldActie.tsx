"use client";
import { usePendingMoneyRequests } from "@/hooks/queries/usePendingMoneyRequests";
import { GeldActieHerstelInhoud } from "./GeldActieHerstel";

/** Persisted requests can be recovered explicitly after reload or a new authorized session. */
export function EerdereGeldActie() {
  const requests = usePendingMoneyRequests();
  if (!requests.pending.length && !requests.error && !requests.message) return null;
  return (
    <section aria-label="Eerdere geldacties" className="mx-4 my-3 flex max-w-xl flex-col gap-2 rounded-xl border border-border bg-warning-bg p-4 text-warning-fg shadow-lg sm:mx-auto">
      <p className="text-sm font-bold" role="status">{requests.pending.length ? "Een eerdere actie heeft nog geen bevestigde uitkomst." : "Resultaat van de eerdere geldactie"}</p>
      <GeldActieHerstelInhoud herstel={requests} />
    </section>
  );
}
