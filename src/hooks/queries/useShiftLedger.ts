"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Eén boeking in de dienst: een bestelling (`orders`) of een opwaardering
 *  (`top_ups`). `amountCents` is altijd het positieve bedrag uit de
 *  database; de richting volgt uit `kind`. */
export type LedgerEntry = {
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
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: LedgerEntry[] };

/**
 * Alle boekingen van één dienst — bestellingen en opwaarderingen, nieuwste
 * eerst — voor de transactielijst op het Dienst-scherm
 * (docs/features/dienst-overzicht.md → Leeshook). Twee platte `select`s,
 * zelfde afweging als useShiftSummary(): alleen lezen, geen RPC, geen
 * paginering op de schaal van één avond aan de bar.
 *
 * Bedragen komen ongewijzigd uit de database (`orders.total_cents`,
 * `top_ups.amount_cents`); hier wordt niets berekend.
 */
export function useShiftLedger(
  shiftId: string | null
): State & { refetch: () => void } {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!shiftId) {
      setState({ status: "ready", entries: [] });
      return;
    }

    setState({ status: "loading" });
    try {
      const supabase = createClient();
      // `orders` en `top_ups` hebben elk twee FK's naar `members`
      // (`member_id` en `served_by`) — een ongekwalificeerde embed is
      // dubbelzinnig (PGRST201, zie useOpenShift.ts), dus per kolom
      // benoemd met een alias.
      const [ordersResult, topUpsResult] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, total_cents, served_by, member:members!member_id(name), server:members!served_by(name), order_lines(qty, products(name))"
          )
          .eq("shift_id", shiftId),
        supabase
          .from("top_ups")
          .select(
            "id, created_at, amount_cents, method, served_by, member:members!member_id(name), server:members!served_by(name)"
          )
          .eq("shift_id", shiftId),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (topUpsResult.error) throw topUpsResult.error;

      // Zelfde untyped-client-kanttekening als useOpenShift: to-one embeds
      // worden als array getypeerd, zijn at runtime één object — via
      // `unknown`.
      const orders: LedgerEntry[] = (ordersResult.data ?? []).map((row) => {
        const member = row.member as unknown as { name: string } | null;
        const server = row.server as unknown as { name: string } | null;
        const lines = (row.order_lines ?? []) as unknown as {
          qty: number;
          products: { name: string } | null;
        }[];
        return {
          id: row.id as string,
          kind: "verkoop",
          createdAt: row.created_at as string,
          // `member_id` null = losse verkoop zonder lid (0001_init.sql);
          // vandaag bouwt de app die niet, maar het schema staat het toe.
          memberName: member?.name ?? null,
          servedById: row.served_by as string,
          servedByName: server?.name ?? "onbekend",
          amountCents: row.total_cents as number,
          itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
          productNames: lines.map((line) => line.products?.name ?? ""),
          method: null,
        };
      });

      const topUps: LedgerEntry[] = (topUpsResult.data ?? []).map((row) => {
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
        };
      });

      const entries = [...orders, ...topUps].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );

      setState({ status: "ready", entries });
    } catch (err) {
      // Never surface the raw error on a bar tablet mid-service — log it
      // for whoever's debugging, show a fixed Dutch message at the bar.
      console.error("useShiftLedger:", err);
      setState({
        status: "error",
        message: "Kan de boekingen van deze dienst niet laden. Controleer de verbinding.",
      });
    }
  }, [shiftId]);

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
