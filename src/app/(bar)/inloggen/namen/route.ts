import { NextResponse } from "next/server";
import { leesNamenlijst } from "@/lib/barLogin";

/**
 * De openbare namenlijst van de bar (docs/features/dienst-per-sessie.md →
 * Inloggen op de bar, punt 1): id en naam van alle niet-gearchiveerde
 * bardienstleden en beheerders, sinds ADR 0017 zonder rol
 * (docs/features/login-rate-limit.md → Namenlijst zonder rol). Server-only entrypoint met de
 * service-role-client (ADR 0006/0016): zonder sessie zou RLS niets teruggeven.
 * Geen database- of Supabase-aanroep in de route zelf (check:policy), die
 * staat in src/lib/barLogin.ts.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const namen = await leesNamenlijst();
    return NextResponse.json({ ok: true, namen }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /inloggen/namen:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
