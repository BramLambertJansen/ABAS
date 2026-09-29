import { NextResponse, type NextRequest } from "next/server";
import { isUuid, leesLoginOpties } from "@/lib/barLogin";

/**
 * Inlogopties voor een naam (docs/features/dienst-per-sessie.md → Inloggen
 * op de bar, punt 2). Leest het `abas_apparaat`-cookie server-side; zonder
 * cookie is het antwoord altijd "alleen wachtwoord".
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let memberId: unknown;
  try {
    memberId = ((await request.json()) as { memberId?: unknown } | null)?.memberId;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isUuid(memberId)) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const opties = await leesLoginOpties(memberId);
    return NextResponse.json({ ok: true, ...opties }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /inloggen/opties:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
