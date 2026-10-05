"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { loadErrorMessage } from "@/lib/loadErrors";
import { voegLogboekSamen } from "./logboekSamenvoegen";

/** Zoveel gebeurtenissen toont het Logboek (de nieuwste). De UI hergebruikt
 *  deze constante in zijn teksten; nooit een los getal. */
export const LOGBOEK_LIMIT = 200;

/** Eén gebeurtenis, org-breed: een verkoop (`orders`), een opwaardering
 *  (`top_ups`) of een terugdraaiing (`order_reversals`) — elk op het tijdstip
 *  van zichzelf (docs/features/logboek-chronologisch-reikwijdte.md). Zelfde
 *  vorm als `LedgerEntry` (`useShiftLedger.ts`) is bewust een **eigen**,
 *  niet geïmporteerd type: twee echt verschillende leesbehoeften.
 *
 * `amountCents` is altijd het positieve bedrag uit de database; de richting
 * volgt uit `kind`. Niets wordt opgeteld. */
export type LogboekEntry = {
  /** Order-id (verkoop én terugdraaiing), of top-up-id. Niet uniek over de
   *  soorten heen: een key bevat altijd ook `kind` (`logboekKey`). */
  id: string;
  kind: "verkoop" | "opwaardering" | "terugdraaiing";
  /** Tijdstip van de gebeurtenis zelf. */
  createdAt: string;
  /** `null` alleen voor een verkoop (of de verkoop achter een
   *  terugdraaiing) zonder lid. */
  memberName: string | null;
  /** Wie de gebeurtenis deed: `served_by` bij verkoop/opwaardering, de
   *  terugdraaier (`reversed_by`) bij een terugdraaiing. */
  actorId: string;
  actorName: string;
  amountCents: number;
  /** Som van de aantallen op de bestelregels; 0 voor een opwaardering. */
  itemCount: number;
  /** Alleen voor zoeken — de lijst toont ze niet. */
  productNames: string[];
  /** `top_ups.method`; `null` voor de andere soorten. */
  method: string | null;
  /** Alleen bij een verkoop: later teruggedraaid. Een status, geen
   *  gebeurtenis. */
  reversed: boolean;
  /** Alleen bij een terugdraaiing. */
  reversal: LogboekReversal | null;
};

export type LogboekReversal = {
  reason: string;
  via: "bar" | "beheer";
  /** `order_reversals.refunded_cents`, ongewijzigd uit de database. */
  refundedCents: number;
  /** De oorspronkelijke bestelling, voor de verwijzing in de rij. */
  originalCreatedAt: string | null;
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
  | {
      status: "ready";
      entries: LogboekEntry[];
      /** Er bestaan meer dan `LOGBOEK_LIMIT` gebeurtenissen: de oudste
       *  ontbreken. Exact, niet geraden. */
      beperkt: boolean;
    };

/**
 * Alle gebeurtenissen van de hele vereniging — verkopen, opwaarderingen en
 * terugdraaiingen, nieuwste eerst — voor het Logboek-scherm (docs/features/
 * logboek-chronologisch-reikwijdte.md). Geen RPC, geen migratie: leest
 * `orders`/`order_lines`/`top_ups`/`order_reversals` onder de bestaande RLS
 * (ADR 0007), org-breed.
 *
 * Drie platte selects, elk op het eigen tijdstip aflopend (daarna op id, zoals `vergelijkLogboek`, zodat de afkapgrens bij gelijke tijden deterministisch is) en met
 * `LOGBOEK_LIMIT + 1` rijen: een element van de gemeenschappelijke top 200
 * staat ook in de top 200 van zijn eigen bron, en met die ene extra rij weet
 * de hook exact of er meer bestaat (`beperkt`). Eén mislukte bron is één
 * leesfout voor het hele scherm: nooit een stil onvolledige tijdlijn.
 *
 * Bedragen komen ongewijzigd uit de database; hier wordt niets berekend.
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
      const [ordersResult, topUpsResult, reversalsResult] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, total_cents, served_by, member:members!member_id(name), server:members!served_by(name), order_lines(qty, products(name)), order_reversals(order_id)"
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(LOGBOEK_LIMIT + 1),
        supabase
          .from("top_ups")
          .select(
            "id, created_at, amount_cents, method, served_by, member:members!member_id(name), server:members!served_by(name)"
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(LOGBOEK_LIMIT + 1),
        supabase
          .from("order_reversals")
          .select(
            "order_id, created_at, reason, via, refunded_cents, reversed_by, reverser:members!reversed_by(name), order:orders!order_id(id, created_at, member:members!member_id(name), order_lines(qty, products(name)))"
          )
          .order("created_at", { ascending: false })
          .order("order_id", { ascending: false })
          .limit(LOGBOEK_LIMIT + 1),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (topUpsResult.error) throw topUpsResult.error;
      if (reversalsResult.error) throw reversalsResult.error;

      const orders: LogboekEntry[] = (ordersResult.data ?? []).map((row) => {
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
          // `member_id` null = losse verkoop zonder lid (0001_init.sql).
          memberName: member?.name ?? null,
          actorId: row.served_by as string,
          actorName: server?.name ?? "onbekend",
          amountCents: row.total_cents as number,
          itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
          productNames: lines.map((line) => line.products?.name ?? ""),
          method: null,
          reversed: firstOrNull<{ order_id: string }>(row.order_reversals) !== null,
          reversal: null,
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
          actorId: row.served_by as string,
          actorName: server?.name ?? "onbekend",
          amountCents: row.amount_cents as number,
          itemCount: 0,
          productNames: [],
          method: row.method as string,
          reversed: false,
          reversal: null,
        };
      });

      const reversals: LogboekEntry[] = (reversalsResult.data ?? []).map((row) => {
        const reverser = firstOrNull<{ name: string }>(row.reverser);
        const original = firstOrNull<{
          created_at: string;
          member: { name: string } | { name: string }[] | null;
          order_lines: { qty: number; products: { name: string } | null }[] | null;
        }>(row.order);
        const lines = original?.order_lines ?? [];
        return {
          id: row.order_id as string,
          kind: "terugdraaiing",
          createdAt: row.created_at as string,
          // Het lid van de oorspronkelijke bestelling; de actor is de
          // terugdraaier, nooit de verkoper.
          memberName: firstOrNull<{ name: string }>(original?.member)?.name ?? null,
          actorId: row.reversed_by as string,
          actorName: reverser?.name ?? "onbekend",
          amountCents: row.refunded_cents as number,
          itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
          productNames: lines.map((line) => line.products?.name ?? ""),
          method: null,
          reversed: false,
          reversal: {
            reason: row.reason as string,
            via: row.via as "bar" | "beheer",
            refundedCents: row.refunded_cents as number,
            originalCreatedAt: original?.created_at ?? null,
          },
        };
      });

      const { entries, beperkt } = voegLogboekSamen([orders, topUps, reversals], LOGBOEK_LIMIT);

      setState({ status: "ready", entries, beperkt });
    } catch (err) {
      // Nooit de ruwe fout tonen — loggen voor wie debugt, een vaste
      // Nederlandse melding op het scherm.
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
