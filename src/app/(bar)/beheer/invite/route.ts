import { NextResponse, type NextRequest } from "next/server";
import { sendMemberInvite } from "@/lib/inviteMember";

/**
 * Route Handler achter de "Uitnodiging (opnieuw) versturen"-knop
 * (LidBeherenOverlay.tsx -> useSendMemberInvite.ts) — docs/features/
 * lid-account-invite.md → RPC's punt 2, ADR 0006. Server-only entrypoint:
 * geen `supabase.from()/.rpc()`/`.auth.admin.*`-aanroep hier zelf
 * (check:policy) — alle databasetoegang zit in src/lib/inviteMember.ts, dat
 * deze route alleen aanroept.
 */
export async function POST(request: NextRequest) {
  let memberId: unknown;
  try {
    const body = await request.json();
    memberId = (body as { memberId?: unknown } | null)?.memberId;
  } catch {
    return NextResponse.json({ ok: false, errorCode: "unknown" }, { status: 400 });
  }

  if (typeof memberId !== "string" || memberId === "") {
    return NextResponse.json({ ok: false, errorCode: "unknown" }, { status: 400 });
  }

  try {
    const result = await sendMemberInvite(memberId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /beheer/invite:", err);
    return NextResponse.json({ ok: false, errorCode: "unknown" }, { status: 500 });
  }
}
