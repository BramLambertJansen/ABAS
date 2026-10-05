"use client";

import { createClient } from "@/lib/supabase/portalClient";
import { reportClientError } from "@/lib/clientErrors";
import type { VerversInfo } from "@/lib/verversen";
import { useStaleLezing } from "./useStaleLezing";

/**
 * Eén transactie van de ingelogde portal-sessie (elke rol, ADR 0012) —
 * 1-op-1 de kolommen van
 * `list_own_transactions()` (docs/features/portal-dashboard.md → RPC's,
 * ADR 0010), plus `itemsDescription` uit een tweede, losse select.
 * Bedragen komen ongewijzigd uit de database, altijd positief — de richting
 * volgt uit `kind`, zelfde conventie als `useShiftLedger.ts`'s
 * `LedgerEntry.amountCents`.
 */
export type PortalTransaction = {
  id: string;
  kind: "bestelling" | "opwaardering";
  createdAt: string;
  amountCents: number;
  /** `top_ups.method` (vandaag altijd "cash"); `null` bij een bestelling. */
  method: string | null;
  serverName: string;
  /** Alleen relevant bij `kind === "bestelling"`; altijd `false` voor een
   *  opwaardering (die kent geen `order_reversals`-rij). */
  reversed: boolean;
  reversalReason: string | null;
  reversedVia: "bar" | "beheer" | null;
  reversedByName: string | null;
  /** Alleen bij `kind === "bestelling"`: "2× pils, 1× chips" — `null` bij
   *  een opwaardering. Leeg (niet `null`) als de bestelling toevallig geen
   *  regels heeft. */
  itemsDescription: string | null;
};

type RpcRow = {
  id: string;
  kind: "bestelling" | "opwaardering";
  created_at: string;
  amount_cents: number;
  method: string | null;
  server_name: string;
  reversed: boolean;
  reversal_reason: string | null;
  reversed_via: "bar" | "beheer" | null;
  reversed_by_name: string | null;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; transactions: PortalTransaction[] };

/**
 * `list_own_transactions()` (nieuwste eerst, zie de RPC's eigen `order by`)
 * gecombineerd met een tweede, platte select op `order_lines`/`products`
 * voor de itemomschrijving per bestelling — dat kolom-probleem heeft de RPC
 * niet nodig te dragen (ADR 0010 → "Niet gekozen"). Geen paginering in v1
 * (spec → Expliciet buiten scope).
 *
 * Eigen-rij-scoping, voor elke rol (ADR 0012 → Beslissing 2), niet via RLS:
 * `list_own_transactions()` is een zelf-scopende RPC zonder doel-parameter
 * (`caller_member_id()`, 0024). De `order_lines`-select is een afgeleide
 * read: hij filtert met `.in("order_id", …)` op de order-id's die die RPC
 * teruggaf, dus alleen eigen bestelregels. Op de RLS van `order_lines_select`
 * (0015, ADR 0007) leunt dit niet: die versmalt alleen een `lid`-sessie, een
 * bardienst/beheerder-sessie ziet via RLS alle bestelregels.
 */
export function usePortalTransactions(): State & { ververs: VerversInfo; refetch: () => void } {
  const { state, ververs, refetch } = useStaleLezing<PortalTransaction[]>({
    wat: "Kan de transacties niet laden.",
    report: (err) => reportClientError(createClient, "usePortalTransactions", err),
    load: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("list_own_transactions");
      if (error) throw error;

      const rows = (data ?? []) as RpcRow[];
      const orderIds = rows.filter((r) => r.kind === "bestelling").map((r) => r.id);

      const itemsByOrderId = new Map<string, string>();
      if (orderIds.length > 0) {
        const { data: lineRows, error: lineError } = await supabase
          .from("order_lines")
          .select("order_id, qty, products(name)")
          .in("order_id", orderIds);
        if (lineError) throw lineError;

        const grouped = new Map<string, string[]>();
        for (const line of lineRows ?? []) {
          const orderId = line.order_id as string;
          const qty = line.qty as number;
          const productName =
            (line.products as unknown as { name: string } | null)?.name ?? "";
          const parts = grouped.get(orderId) ?? [];
          parts.push(`${qty}× ${productName}`);
          grouped.set(orderId, parts);
        }
        for (const [orderId, parts] of grouped) {
          itemsByOrderId.set(orderId, parts.join(", "));
        }
      }

      const transactions: PortalTransaction[] = rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        createdAt: row.created_at,
        amountCents: row.amount_cents,
        method: row.method,
        serverName: row.server_name,
        reversed: row.reversed,
        reversalReason: row.reversal_reason,
        reversedVia: row.reversed_via,
        reversedByName: row.reversed_by_name,
        itemsDescription: row.kind === "bestelling" ? (itemsByOrderId.get(row.id) ?? "") : null,
      }));
      return transactions;
    },
  });

  if (state.status === "ready") {
    return { status: "ready", transactions: state.data, ververs, refetch };
  }
  if (state.status === "error") {
    return { status: "error", message: state.message, ververs, refetch };
  }
  return { status: "loading", ververs, refetch };
}
