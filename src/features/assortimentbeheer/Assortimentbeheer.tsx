"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBeheerSession } from "@/hooks/queries/useBeheerSession";
import { useRegisterBarSession } from "@/hooks/queries/useRegisterBarSession";
import { BarSessieProvider } from "@/features/bar-sessie/BarSessieProvider";
import { useBarSessie } from "@/features/bar-sessie/BarSessieContext";
import { BeheerLogin } from "./BeheerLogin";
import { BeheerTabs } from "./BeheerTabs";
import { ModusKeuze } from "./ModusKeuze";

function Laden() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-canvas px-6 py-10 font-sans text-ink">
      <p className="text-sm font-semibold text-muted" role="status">
        Bezig met laden…
      </p>
    </main>
  );
}

function BeheerSchermen() {
  const sessie = useBarSessie();
  const beheerSessie = useBeheerSession();
  const register = useRegisterBarSession();
  const router = useRouter();
  const [registreerFout, setRegistreerFout] = useState<string | null>(null);

  const barSessie = sessie.session?.mode === "bar";

  // Een sessie in modus bar hoort op de bar: modi zijn losse sessies en
  // overstappen vereist uitloggen (ADR 0003). Dit is ook wat er gebeurt na de
  // keuze "Bar" in ModusKeuze.
  useEffect(() => {
    if (barSessie && (sessie.fase === "actief" || sessie.fase === "hervatten")) {
      router.replace("/");
    }
  }, [barSessie, sessie.fase, router]);

  async function kies(modus: "bar" | "beheer") {
    setRegistreerFout(null);
    const resultaat = await register.registerBarSession(modus);
    if (resultaat.ok) {
      sessie.naRegistratie();
    } else {
      // De sessiecodes krijgen de centrale melding; al het andere is een
      // gewone foutregel.
      setRegistreerFout("er ging iets mis, probeer het opnieuw");
    }
  }

  switch (sessie.fase) {
    case "laden":
      return <Laden />;
    case "fout":
      return (
        <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-canvas px-6 py-10 font-sans text-ink">
          <p className="max-w-xs text-center text-sm font-semibold text-danger" role="alert">
            {sessie.foutMelding}
          </p>
          <button
            type="button"
            onClick={sessie.herlaad}
            className="text-xs font-semibold text-muted underline hover:text-ink"
          >
            Opnieuw proberen
          </button>
        </main>
      );
    case "uitgelogd":
      return <BeheerLogin />;
    case "geen_bar_sessie": {
      // Een Supabase-sessie zonder bar-sessie: net ingelogd met e-mail. Eerst
      // controleren dat het account bij een lid met een bar-rol hoort.
      if (beheerSessie.status === "loading") return <Laden />;
      if (beheerSessie.status === "signed-out") return <BeheerLogin />;
      if (beheerSessie.status === "denied") return <BeheerLogin deniedMessage={beheerSessie.message} />;
      return (
        <ModusKeuze
          name={beheerSessie.name}
          role={beheerSessie.role}
          pending={register.status === "pending"}
          errorMessage={registreerFout}
          onChooseBar={() => kies("bar")}
          onChooseBeheer={() => kies("beheer")}
          onSignOut={() => void sessie.lokaalUitloggen()}
        />
      );
    }
    case "hervatten":
    case "actief":
      // Modus bar: de effect hierboven stuurt naar `/`. Een onbevestigde
      // beheersessie sluit de provider (`niet_hervat`), dat is dan weer "laden".
      if (barSessie || !sessie.session) return <Laden />;
      return (
        <BeheerTabs
          name={sessie.session.memberName}
          role={sessie.session.memberRole}
          onSignOut={() => void sessie.uitloggen(false)}
        />
      );
  }
}

/**
 * `/beheer`'s top-level screen (issue #14, docs/features/assortimentbeheer.md;
 * uitgebreid met een tabbalk in issue #11 en met een modus-keuze in issue
 * #42, docs/features/auth-methode-per-lid.md; en sinds dienst-per-sessie, ADR
 * 0016, met server-side modus en hervatten).
 *
 * - Zonder Supabase-sessie: het inlogformulier — ook als er wél een sessie is
 *   die niet naar een actieve bardienst/beheerder herleidt (`denied`, met een
 *   duidelijke foutmelding).
 * - Een Supabase-sessie zonder geregistreerde bar-sessie: `ModusKeuze`
 *   (Bar | Beheer, ADR 0003 → Beslissing 2). De keuze registreert de sessie in
 *   die modus (`register_bar_session`); daarna wisselt ze nooit meer.
 * - Een actieve beheersessie: `BeheerTabs`. Na browser dicht en weer open
 *   wordt een beheersessie niet hervat (ADR 0016 → Beslissing 8): de provider
 *   sluit haar (`niet_hervat`) en het inlogformulier volgt.
 * - Een sessie in modus bar hoort op `/`.
 *
 * De hartslag, de melding bij een gesloten sessie en het lokaal uitloggen
 * zitten in `BarSessieProvider`.
 */
export function Assortimentbeheer() {
  return (
    <BarSessieProvider>
      <BeheerSchermen />
    </BarSessieProvider>
  );
}
