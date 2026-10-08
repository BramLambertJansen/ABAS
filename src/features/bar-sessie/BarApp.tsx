"use client";

import { Knop } from "@/components/Knop";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BarInloggen } from "@/features/bar-inloggen/BarInloggen";
import { DienstStarten } from "@/features/dienst-starten/DienstStarten";
import { DienstTabs } from "@/features/verkoop/DienstTabs";
import { useFocusNaFaseFout } from "@/hooks/useFocusNaFaseFout";
import { BarSessieProvider } from "./BarSessieProvider";
import { useBarSessie } from "./BarSessieContext";
import { HervatScherm } from "./HervatScherm";

function Laden() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-rail px-6 py-10 font-sans text-white">
      <p className="text-sm font-semibold text-rail-muted" role="status">
        Bezig met laden…
      </p>
    </main>
  );
}

function BarSchermen() {
  const sessie = useBarSessie();
  const router = useRouter();
  const beheerSessie = sessie.fase === "actief" && sessie.session?.mode === "beheer";

  // Een beheersessie werkt niet op de bar: modi zijn losse sessies en
  // overstappen vereist uitloggen (ADR 0003). Ze hoort op /beheer.
  useEffect(() => {
    if (beheerSessie) router.replace("/beheer");
  }, [beheerSessie, router]);

  useFocusNaFaseFout(sessie.fase);

  switch (sessie.fase) {
    case "laden":
      return <Laden />;
    case "fout":
      return (
        <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-rail px-6 py-10 font-sans text-white">
          <p className="max-w-xs text-center text-sm font-semibold text-rail-error" role="alert">
            {sessie.foutMelding}
          </p>
          <Knop
            variant="tekst" tone="rail"
            onClick={sessie.herlaad}
          >
            Opnieuw proberen
          </Knop>
        </main>
      );
    case "uitgelogd":
    case "geen_bar_sessie":
      return <BarInloggen />;
    case "hervatten":
      return <HervatScherm />;
    case "actief":
      if (beheerSessie) return <Laden />;
      if (sessie.shift) {
        return <DienstTabs key={`${sessie.session?.id}:${sessie.shift.id}`} shift={sessie.shift} onShiftEnded={sessie.herlaad} />;
      }
      return <DienstStarten />;
  }
}

/**
 * Het startpunt van de bar-shell (`/`), sinds dienst-per-sessie (ADR 0016):
 * geen gedeeld device-account meer, maar een persoonlijke sessie per apparaat.
 *
 * - geen sessie: het startscherm met de namenlijst (`BarInloggen`);
 * - een sessie van vóór "browser dicht": eerst "Verder als {naam}?";
 * - een actieve sessie zonder eigen dienst: een dienst starten of de dienst
 *   elders zien (`DienstStarten`);
 * - een actieve sessie met eigen dienst: Verkoop/Dienst (`DienstTabs`).
 *
 * Alle sessieafhandeling (hartslag, melding bij een gesloten sessie, lokaal
 * uitloggen) zit in `BarSessieProvider`.
 */
export function BarApp() {
  return (
    <BarSessieProvider>
      <BarSchermen />
    </BarSessieProvider>
  );
}
