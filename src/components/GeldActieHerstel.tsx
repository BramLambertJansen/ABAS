"use client";

import { useRef } from "react";
import { usePendingMoneyRequests, type MoneyResolution, type RecoveryAction } from "@/hooks/queries/usePendingMoneyRequests";
import { useMembers } from "@/hooks/queries/useMembers";
import type { MoneyOperation } from "@/lib/moneyRequest";
import { formatCents } from "@/lib/money";
import { Knop } from "./Knop";

const NAMEN = { place_order: "bestelling", top_up: "opwaardering", create_member: "nieuw lid" };

/** One presentation for a saved intent and an unknown result in an open dialog. */
export function GeldActieHerstel({ operation, context, onResolved }: {
  operation?: MoneyOperation;
  context?: string;
  onResolved?: (resolution: MoneyResolution) => void;
}) {
  const herstel = usePendingMoneyRequests();
  return <GeldActieHerstelInhoud herstel={herstel} operation={operation} context={context} onResolved={onResolved} />;
}

export function GeldActieHerstelInhoud({ herstel, operation, context, onResolved }: {
  herstel: ReturnType<typeof usePendingMoneyRequests>;
  operation?: MoneyOperation;
  context?: string;
  onResolved?: (resolution: MoneyResolution) => void;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const pending = herstel.pending.filter((intent) => !operation || intent.operation === operation);
  async function kies(op: MoneyOperation, action: RecoveryAction) {
    const result = await herstel.recover(op, action);
    if (!result) return;
    if (onResolved) onResolved(result);
    else requestAnimationFrame(() => statusRef.current?.focus());
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">Controleren zoekt alleen het eerdere resultaat. Veilig afronden kan de nog niet verwerkte actie uitvoeren. Definitief annuleren sluit alleen een onbevestigde actie af; het draait geen boeking terug.</p>
      {pending.map((intent) => (
        <div key={intent.id} className="flex flex-col gap-2">
          {context ? <p className="wrap-break-word text-sm font-bold">{context}</p> : <GeldActieContext intent={intent} />}
          <div className="flex flex-wrap gap-2">
            {([['check', 'Resultaat controleren'], ['complete', `Eerdere ${NAMEN[intent.operation]} veilig afronden`], ['cancel', `Eerdere ${NAMEN[intent.operation]} definitief annuleren`]] as const).map(([action, label]) => (
              <Knop
                key={action} aria-disabled={herstel.busy}
                onClick={() => { if (!herstel.busy) void kies(intent.operation, action); }}>
                {label}
              </Knop>
            ))}
          </div>
        </div>
      ))}
      <p ref={statusRef} tabIndex={-1} role="status" className="wrap-break-word text-sm outline-hidden">
        {herstel.busy ? "Bezig met controleren…" : herstel.message}
      </p>
      {herstel.error && <p role="alert" className="text-sm">{herstel.error}</p>}
      {herstel.message && !pending.length && !onResolved && (
        <Knop onClick={() => window.location.reload()}>Gegevens verversen</Knop>
      )}
    </div>
  );
}

function GeldActieContext({ intent }: { intent: ReturnType<typeof usePendingMoneyRequests>["pending"][number] }) {
  // create_member's name and amount already belong to the captured intent.
  if (intent.operation === "create_member") return <p className="wrap-break-word text-sm font-bold">Nieuw lid: {String(intent.args.p_name)} · Startsaldo {formatCents(Number(intent.args.p_starting_balance_cents ?? 0))}</p>;
  return <BestaandLidContext intent={intent} />;
}
function BestaandLidContext({ intent }: { intent: ReturnType<typeof usePendingMoneyRequests>["pending"][number] }) {
  const leden = useMembers();
  const naam = leden.status === "ready" ? leden.members.find((lid) => lid.id === intent.args.p_member_id)?.name : null;
  const detail = intent.operation === "top_up" ? formatCents(Number(intent.args.p_amount_cents))
    : `${Array.isArray(intent.args.p_lines) ? intent.args.p_lines.length : 0} productregels`;
  return <p className="wrap-break-word text-sm font-bold">{NAMEN[intent.operation]} voor {naam ?? "het eerder gekozen lid (naam niet beschikbaar)"} · {detail}</p>;
}
