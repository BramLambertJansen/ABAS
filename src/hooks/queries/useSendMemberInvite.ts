"use client";

import { useState } from "react";
import { reportClientError } from "@/lib/clientErrors";
import { createClient } from "@/lib/supabase/client";

/** Error codes de server-side invite-actie (src/lib/inviteMember.ts,
 *  aangeroepen via src/app/(bar)/beheer/invite/route.ts) daadwerkelijk
 *  teruggeeft. Anything else valt terug op "unknown" — zelfde
 *  "eigen ErrorCode-type per hook"-patroon als de overige mutatiehooks in
 *  deze map (bv. useUpdateMemberEmail.ts). `already_linked`/
 *  `email_already_registered`/`rate_limited` zijn nieuw voor dit ticket, zie
 *  docs/features/lid-account-invite.md → Architect-beslissingen → Copy. */
export type SendMemberInviteErrorCode =
  | "actor_not_found"
  | "no_admin_role"
  | "member_not_found"
  | "already_linked"
  | "email_already_registered"
  | "rate_limited"
  | "unknown";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: SendMemberInviteErrorCode };

function toErrorCode(code: unknown): SendMemberInviteErrorCode {
  if (
    code === "actor_not_found" ||
    code === "no_admin_role" ||
    code === "member_not_found" ||
    code === "already_linked" ||
    code === "email_already_registered" ||
    code === "rate_limited"
  ) {
    return code;
  }
  return "unknown";
}

/**
 * Roept de server-side invite-actie aan via `fetch()` (geen `supabase.rpc()`
 * hier — dit is geen RPC, `inviteUserByEmail()` kan nooit binnen een
 * `SECURITY DEFINER`-functie draaien, zie ADR 0006). Contract: input
 * `memberId`, output onderscheidt `invited: true`/`invited: false` (no-op,
 * lid niet eligible) bij succes, en een `errorCode` bij mislukking — zelfde
 * idle/pending/error-statusvorm als de overige mutatiehooks in deze map.
 */
export function useSendMemberInvite() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function sendInvite(
    memberId: string
  ): Promise<
    | { invited: true; invitedAt: string; errorCode: null }
    | { invited: false; invitedAt: null; errorCode: null }
    | { invited: null; invitedAt: null; errorCode: SendMemberInviteErrorCode }
  > {
    setState({ status: "pending" });
    try {
      const response = await fetch("/beheer/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        invited?: boolean;
        invitedAt?: string;
        errorCode?: unknown;
      };

      if (!result.ok) {
        const code = toErrorCode(result.errorCode);
        // Alleen een onverwachte uitkomst melden; de bekende codes zijn
        // domeinuitkomsten. `result` bevat geen `code`-veld, dus
        // classifyLoadError maakt er `server` zonder code van.
        if (code === "unknown") reportClientError(createClient, "useSendMemberInvite", result);
        setState({ status: "error", code });
        return { invited: null, invitedAt: null, errorCode: code };
      }
      setState({ status: "idle" });
      if (result.invited && result.invitedAt) {
        return { invited: true, invitedAt: result.invitedAt, errorCode: null };
      }
      return { invited: false, invitedAt: null, errorCode: null };
    } catch (err) {
      reportClientError(createClient, "useSendMemberInvite", err);
      setState({ status: "error", code: "unknown" });
      return { invited: null, invitedAt: null, errorCode: "unknown" };
    }
  }

  return {
    status: state.status,
    errorCode: state.status === "error" ? state.code : null,
    sendInvite,
    reset: () => setState({ status: "idle" }),
  };
}
