import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SysteemVenster } from "@/lib/systeem/SysteemVenster";
import systeem from "../../../../../../scripts/kit/systeem.lokaal.json";
import { PAGINA, VENSTER_TEKSTEN, type VensterId } from "../../teksten";
import { VensterInhoud } from "../../vensters";

export const dynamic = "force-static";
/** Alleen de ids uit systeem.lokaal.json → vensters; een onbekend id geeft 404. */
export const dynamicParams = false;

type Params = Promise<{ id: string }>;

function isVensterId(id: string): id is VensterId {
  return Object.hasOwn(systeem.vensters, id);
}

export function generateStaticParams(): Array<{ id: string }> {
  return Object.keys(systeem.vensters).map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: isVensterId(id) ? `${VENSTER_TEKSTEN[id].naam} — ${PAGINA.metaTitel}` : PAGINA.metaTitel,
    robots: { index: false, follow: false },
  };
}

/**
 * Eén los venster van het ontwerpsysteem (docs/features/ontwerpsysteem-
 * uitzonderingen.md → Vensters): een eigen document voor een component dat
 * een provider, een overlay of het hele scherm nodig heeft. De toegang loopt
 * via de poort van /design (src/middleware.ts).
 */
export default async function VensterPagina({ params }: { params: Params }) {
  const { id } = await params;
  if (!isVensterId(id)) notFound();
  const venster = systeem.vensters[id];
  const eigenLandmark = "eigenLandmark" in venster && venster.eigenLandmark;
  return (
    <SysteemVenster naam={VENSTER_TEKSTEN[id].naam} eigenLandmark={eigenLandmark}>
      <VensterInhoud id={id} />
    </SysteemVenster>
  );
}
