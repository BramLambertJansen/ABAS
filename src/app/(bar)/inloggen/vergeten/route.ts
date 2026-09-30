import { NextResponse, type NextRequest } from "next/server";
import { isUuid, stuurHerstellink } from "@/lib/barLogin";
import { clientIp } from "@/lib/clientIp";

/**
 * Wachtwoord vergeten vanaf de namenlijst (docs/features/dienst-per-sessie.md
 * → Inloggen op de bar, punt 5). Het antwoord is altijd neutraal (ADR 0013):
 * ook voor een lid zonder account of een onbekend id. `limited`: de eigen
 * limiet is bereikt en er ging geen mail (docs/features/login-rate-limit.md).
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

  const result = await stuurHerstellink(memberId, request.nextUrl.origin, clientIp(request.headers));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
