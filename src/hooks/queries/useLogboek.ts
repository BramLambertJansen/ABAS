"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";

/** Meest recente boekingen, org-breed. */
const LOGBOEK_LIMIT = 200;

/** Eén boeking, org-breed: een bestelling (`orders`) of een opwaardering
 *  (`top_ups`). Zelfde vorm als `LedgerEntry`
 *  (`src/hooks/queries/useShiftLedger.ts`) — bewust een **eigen**, niet
 *  geïmporteerd type (docs/features/logboek.md → RPC's/leeshook): twee
 *  echt verschillende leesbehoeften op dezelfde tabellen, geen toevallige
 *  gelijkenis die de twee hooks aan elkaar zou koppelen.
 *
 * `amountCents` is altijd het positieve bedrag uit de database; de richting
 * volgt uit `kind`. */
export type LogboekEntry = {
  id: string;
  kind: "verkoop" | "opwaardering";
  createdAt: string;
  /** `null` alleen voor een verkoop zonder lid. */
  memberName: string | null;
  servedById: string;
  servedByName: string;
  amountCents: number;
  /** Som van de aantallen op de bestelregels; 0 voor een opwaardering. */
  itemCount: number;
  /** Alleen voor zoeken — de lijst toont ze niet. */
  productNames: string[];
  /** `top_ups.method` (vandaag altijd "contant"); `null` voor een verkoop. */
  method: string | null;
  /** Alleen bij een verkoop: de terugdraaiing uit `order_reversals`, of
   *  `null` als de bestelling (nog) staat — docs/features/
   *  bestelling-terugdraaien.md. De enige "vraagt om een blik"-gebeurtenis
   *  met een echte databron (docs/features/logboek.md → Datamodel). */
  reversal: LogboekReversal | null;
};

export type LogboekReversal = {
  reason: string;
  reversedByName: string;
  via: "bar" | "beheer";
};

/** PostgREST geeft een één-op-één-embed (order_reversals.order_id is de
 *  primary key) als object terug; de untyped client typeert hem als array.
 *  Beide vormen afvangen in plaats van op één te gokken. Zelfde helper als
 *  useShiftLedger.ts (niet geïmporteerd — zie het type hierboven voor
 *  waarom deze twee hooks los van elkaar staan). */
function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return (value as T | null) ?? null;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: LogboekEntry[] };

/**
 * Alle boekingen van de hele vereniging — bestellingen en opwaarderingen,
 * nieuwste eerst — voor het Logboek-scherm (docs/features/logboek.md →
 * RPC's/leeshook). Geen nieuwe RPC, geen migratie: leest `orders`/
 * `order_lines`/`top_ups`/`order_reversals` onder de bestaande RLS (ADR
 * 0007), org-breed in plaats van per dienst — `useShiftLedger`'s
 * `shiftId`-parameter hergebruiken zou "geen open dienst" (`null`) een
 * tweede, tegenstrijdige betekenis geven.
 *
 * Elke bron wordt op `created_at` aflopend gesorteerd opgehaald met een
 * eigen cap van 200 — zo blijft de samengevoegde, op datum gesorteerde
 * lijst gegarandeerd correct tot en met de meest recente 200 boekingen
 * (spec → "Cap: de meest recente 200 boekingen, nieuwste eerst"), zonder
 * alles te moeten ophalen.
 *
 * Bedragen komen ongewijzigd uit de database (`orders.total_cents`,
 * `top_ups.amount_cents`); hier wordt niets berekend.
 */
export function useLogboek(): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const supabase = createClient();
      // Zelfde dubbele-FK-kanttekening als useShiftLedger.ts (`member_id`
      // en `served_by` wijzen allebei naar `members`, dus elke embed is
      // per kolom benoemd).
      const [ordersResult, topUpsResult] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, total_cents, served_by, member:members!member_id(name), server:members!served_by(name), order_lines(qty, products(name)), order_reversals(reason, via, reverser:members!reversed_by(name))"
          )
          .order("created_at", { ascending: false })
          .limit(LOGBOEK_LIMIT),
        supabase
          .from("top_ups")
          .select(
            "id, created_at, amount_cents, method, served_by, member:members!member_id(name), server:members!served_by(name)"
          )
          .order("created_at", { ascending: false })
          .limit(LOGBOEK_LIMIT),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (topUpsResult.error) throw topUpsResult.error;

      const orders: LogboekEntry[] = (ordersResult.data ?? []).map((row) => {
        const member = row.member as unknown as { name: string } | null;
        const server = row.server as unknown as { name: string } | null;
        const lines = (row.order_lines ?? []) as unknown as {
          qty: number;
          products: { name: string } | null;
        }[];
        const reversal = firstOrNull<{
          reason: string;
          via: "bar" | "beheer";
          reverser: { name: string } | null;
        }>(row.order_reversals);
        return {
          id: row.id as string,
          kind: "verkoop",
          createdAt: row.created_at as string,
          // `member_id` null = losse verkoop zonder lid (0001_init.sql).
          memberName: member?.name ?? null,
          servedById: row.served_by as string,
          servedByName: server?.name ?? "onbekend",
          amountCents: row.total_cents as number,
          itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
          productNames: lines.map((line) => line.products?.name ?? ""),
          method: null,
          reversal: reversal
            ? {
                reason: reversal.reason,
                reversedByName: reversal.reverser?.name ?? "onbekend",
                via: reversal.via,
              }
            : null,
        };
      });

      const topUps: LogboekEntry[] = (topUpsResult.data ?? []).map((row) => {
        const member = row.member as unknown as { name: string } | null;
        const server = row.server as unknown as { name: string } | null;
        return {
          id: row.id as string,
          kind: "opwaardering",
          createdAt: row.created_at as string,
          memberName: member?.name ?? "onbekend",
          servedById: row.served_by as string,
          servedByName: server?.name ?? "onbekend",
          amountCents: row.amount_cents as number,
          itemCount: 0,
          productNames: [],
          method: row.method as string,
          reversal: null,
        };
      });

      const entries = [...orders, ...topUps]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, LOGBOEK_LIMIT);

      setState({ status: "ready", entries });
    } catch (err) {
      // Nooit de ruwe fout tonen — loggen voor wie debugt, een vaste
      // Nederlandse melding op het scherm (spec → Randgevallen).
      reportClientError(createClient, "useLogboek", err);
      setState({
        status: "error",
        message: loadErrorMessage("Kan het logboek niet laden.", err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) {
        setState({ status: "error", message: "Onbekende fout." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tick, load]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
