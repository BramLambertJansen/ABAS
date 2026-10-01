import { NextResponse, type NextRequest } from "next/server";
import { isUuid, loginMetWachtwoord } from "@/lib/barLogin";
import { clientIp } from "@/lib/clientIp";

/**
 * Inloggen met wachtwoord vanaf de namenlijst (docs/features/
 * dienst-per-sessie.md → Inloggen op de bar, punt 3). De sessie landt in de
 * cookies van deze response; het wachtwoord wordt niet gelogd.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { memberId?: unknown; password?: unknown } | null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, code: "unknown" }, { status: 400 });
  }
  if (!isUuid(body?.memberId) || typeof body?.password !== "string" || body.password === "") {
    return NextResponse.json({ ok: false, code: "unknown" }, { status: 400 });
  }

  try {
    const result = await loginMetWachtwoord(body.memberId, body.password, clientIp(request.headers));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /inloggen/wachtwoord:", err);
    return NextResponse.json({ ok: false, code: "unknown" }, { status: 500 });
  }
}
