"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pendingMoneyRequests, runMoneyRequest, inspectPendingMoneyRequest, type MoneyOperation } from "@/lib/moneyRequest";
import { isSessionErrorCode, notifySessionCode } from "@/lib/barSessie";
import { reportClientError } from "@/lib/clientErrors";

export type MoneyResolution = { status: "completed"; result: Record<string, unknown> } | { status: "cancelled" };
export type RecoveryAction = "check" | "complete" | "cancel";

/** Mount/focus only reads local intents. Every server recovery is an explicit click. */
export function usePendingMoneyRequests() {
  const [pending, setPending] = useState<ReturnType<typeof pendingMoneyRequests>>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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

  async function recover(operation: MoneyOperation, action: RecoveryAction): Promise<MoneyResolution | null> {
    if (busyRef.current) return null;
    const intent = pending.find((item) => item.operation === operation);
    if (!intent) return null;
    busyRef.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const client = createClient();
      const inspection = await inspectPendingMoneyRequest(client, operation, action === "cancel", undefined, intent.id);
      const receipt = inspection.data as { status?: string; result?: Record<string, unknown> } | null;
      let resolution: MoneyResolution | null = null;
      let failure = inspection.error;
      if (!failure && receipt?.status === "completed") {
        resolution = { status: "completed", result: receipt.result! };
      } else if (!failure && receipt?.status === "cancelled") {
        resolution = { status: "cancelled" };
      } else if (!failure && receipt?.status === "missing" && action === "check") {
        setMessage("Er is nog geen boeking gevonden. De actie is nog niet afgesloten; je kunt haar veilig afronden of definitief annuleren.");
        return null;
      } else if (!failure && receipt?.status === "missing" && action === "complete") {
        const result = await runMoneyRequest(client, operation, intent.args, undefined, intent.id);
        failure = result.error;
        if (!failure && result.data != null) resolution = { status: "completed", result: result.data as Record<string, unknown> };
      }
      if (!resolution) {
        if (failure && isSessionErrorCode(failure.message)) notifySessionCode(failure.message);
        else if (failure && failure.code !== "P0001") reportClientError(client, "usePendingMoneyRequests", failure);
        setError("De eerdere actie kon niet worden bevestigd. Controleer de dienst en het logboek voordat je verdergaat.");
        return null;
      }
      setPending((items) => items.filter((item) => item.id !== intent.id));
      setMessage(resolution.status === "completed"
        ? "De eerdere actie is bevestigd. Er is geen extra boeking gemaakt voor een al verwerkte actie."
        : "De onbevestigde actie is definitief geannuleerd. Er is geen boeking teruggedraaid.");
      return resolution;
    } catch (err) {
      reportClientError(createClient, "usePendingMoneyRequests", err);
      setError("De uitkomst is nog onbekend. De eerdere actie blijft bewaard.");
      return null;
    } finally { busyRef.current = false; setBusy(false); }
  }
  return { pending, busy, error, message, recover };
}
