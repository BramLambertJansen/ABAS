"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pendingMoneyRequests, runMoneyRequest, inspectPendingMoneyRequest, type MoneyOperation } from "@/lib/moneyRequest";
import { isSessionErrorCode, notifySessionCode } from "@/lib/barSessie";
import { reportClientError } from "@/lib/clientErrors";

/** Recovery is explicit, never an automatic booking on mount or login. */
export function usePendingMoneyRequests() {
  const [pending, setPending] = useState<ReturnType<typeof pendingMoneyRequests>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data } = await createClient().auth.getSession();
        if (mounted) setPending(data.session ? pendingMoneyRequests(data.session.user.id) : []);
      } catch { if (mounted) setError("Eerdere acties konden niet uit lokale opslag worden gelezen."); }
    }
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => { mounted = false; window.removeEventListener("focus", onFocus); window.removeEventListener("storage", onFocus); };
  }, []);

  async function recover(operation: MoneyOperation, cancel = false): Promise<boolean> {
    if (busy) return false;
    const intent = pending.find((item) => item.operation === operation);
    if (!intent) return false;
    setBusy(true); setError("");
    try {
      const client = createClient();
      const inspection = await inspectPendingMoneyRequest(client, operation, cancel);
      const status = (inspection.data as { status?: string } | null)?.status;
      if (!inspection.error && (status === "completed" || status === "cancelled")) return true;
      if (!inspection.error && status !== "missing") {
        setError("De eerdere actie kon niet worden bevestigd. De sleutel blijft bewaard.");
        return false;
      }
      const result = inspection.error || cancel ? inspection : await runMoneyRequest(client, operation, intent.args);
      if (result.error) {
        if (isSessionErrorCode(result.error.message)) notifySessionCode(result.error.message);
        else if (result.error.code !== "P0001") reportClientError(client, "usePendingMoneyRequests", result.error);
        setError("De eerdere actie kon niet worden bevestigd. Controleer de dienst en het logboek voordat je verdergaat.");
        return false;
      }
      return result.data != null;
    } catch (err) {
      reportClientError(createClient, "usePendingMoneyRequests", err);
      setError("De uitkomst is nog onbekend. De eerdere actie blijft bewaard.");
      return false;
    } finally { setBusy(false); }
  }
  return { pending, busy, error, recover };
}
