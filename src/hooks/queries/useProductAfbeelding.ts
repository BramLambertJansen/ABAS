"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrors";
import { isSessionErrorCode, notifySessionCode, type SessionErrorCode } from "@/lib/barSessie";
import { productImageUrl } from "./productRows";

/** Foutcodes die de server-actie (src/lib/productImage.ts, via
 *  src/app/(bar)/beheer/productafbeelding/route.ts) teruggeeft —
 *  docs/features/productafbeeldingen.md → Server-actie. De sessiecodes gaan
 *  naar de centrale afhandeling (`notifySessionCode`), zoals in
 *  useAddShiftMember.ts; alles wat niet in deze lijst staat, is `unknown`. */
export type ProductAfbeeldingErrorCode =
  | SessionErrorCode
  | "actor_not_found"
  | "no_admin_role"
  | "product_not_found"
  | "file_missing"
  | "file_too_large"
  | "unsupported_type"
  | "upload_failed"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending"; action: "upload" | "remove" }
  | { status: "error"; code: ProductAfbeeldingErrorCode };

const ROUTE = "/beheer/productafbeelding";

function toErrorCode(code: unknown): ProductAfbeeldingErrorCode {
  if (isSessionErrorCode(code)) {
    notifySessionCode(code);
    return code;
  }
  if (
    code === "actor_not_found" ||
    code === "no_admin_role" ||
    code === "product_not_found" ||
    code === "file_missing" ||
    code === "file_too_large" ||
    code === "unsupported_type" ||
    code === "upload_failed"
  ) {
    return code;
  }
  return "unknown";
}

/**
 * Uploaden, vervangen en weghalen van een productafbeelding via de
 * server-actie (`fetch`, geen `supabase.storage` en geen RPC hier: Storage
 * schrijven kan alleen server-side, ADR 0018). Zelfde
 * idle/pending/error-vorm als useSendMemberInvite.ts. Na succes de nieuwe
 * `imageUrl` (of `null` na weghalen), gemaakt met dezelfde helper als de
 * leeshooks; bij een fout `undefined`.
 */
export function useProductAfbeelding() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function send(
    action: "upload" | "remove",
    request: () => Promise<Response>
  ): Promise<{ imageUrl: string | null } | undefined> {
    setState({ status: "pending", action });
    try {
      const response = await request();
      // Vercel weigert een body boven 4,5 MB vóór de route draait, met een
      // 413 zonder JSON (spec → Randgevallen "Bestand te groot").
      if (response.status === 413) {
        setState({ status: "error", code: "file_too_large" });
        return undefined;
      }
      const result = (await response.json()) as {
        ok?: boolean;
        imagePath?: unknown;
        errorCode?: unknown;
      };

      if (!result.ok) {
        const code = toErrorCode(result.errorCode);
        // Alleen een onverwachte uitkomst melden; de bekende codes zijn
        // domeinuitkomsten (zelfde regel als useSendMemberInvite.ts).
        if (code === "unknown") reportClientError(createClient, "useProductAfbeelding", result);
        setState({ status: "error", code });
        return undefined;
      }
      setState({ status: "idle" });
      return { imageUrl: productImageUrl(createClient(), result.imagePath) };
    } catch (err) {
      reportClientError(createClient, "useProductAfbeelding", err);
      setState({ status: "error", code: "unknown" });
      return undefined;
    }
  }

  function upload(productId: string, file: File) {
    return send("upload", () => {
      const body = new FormData();
      body.append("productId", productId);
      body.append("file", file);
      return fetch(ROUTE, { method: "POST", body });
    });
  }

  function remove(productId: string) {
    return send("remove", () =>
      fetch(ROUTE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
    );
  }

  return {
    status: state.status,
    /** Welke actie loopt: voor de bezig-tekst in de ingedrukte knop. */
    pendingAction: state.status === "pending" ? state.action : null,
    errorCode: state.status === "error" ? state.code : null,
    upload,
    remove,
    reset: () => setState({ status: "idle" }),
  };
}
