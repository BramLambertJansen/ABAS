import { NextResponse, type NextRequest } from "next/server";
import { isUuid, loginMetPin } from "@/lib/barLogin";

/**
 * Inloggen met PIN vanaf de namenlijst (docs/features/dienst-per-sessie.md →
 * Inloggen op de bar, punt 4): alleen op een vertrouwd apparaat, met
 * lockout. De PIN wordt niet gelogd.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { memberId?: unknown; pin?: unknown } | null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, code: "unknown" }, { status: 400 });
  }
  if (!isUuid(body?.memberId) || typeof body?.pin !== "string") {
    return NextResponse.json({ ok: false, code: "unknown" }, { status: 400 });
  }

  try {
    const result = await loginMetPin(body.memberId, body.pin);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /inloggen/pin:", err);
    return NextResponse.json({ ok: false, code: "unknown" }, { status: 500 });
  }
}
