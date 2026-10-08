import type { Metadata } from "next";
import { leesThema, type ThemaGroep } from "@/lib/systeem/leesThema";
import { SysteemSectie } from "@/lib/systeem/SysteemSectie";
import { TokenTabel } from "@/lib/systeem/TokenTabel";
import { PAGINA, TOKENS } from "./teksten";
import { Voorbeelden } from "./voorbeelden";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: PAGINA.metaTitel,
  robots: { index: false, follow: false },
};

const TOKEN_GROEPEN = ["kleuren", "hoogtes", "radii", "schaduwen", "tekstmaten", "overig"] as const satisfies readonly ThemaGroep[];

/**
 * Het ontwerpsysteem op één pagina (docs/features/ontwerpsysteem.md): de tokens
 * uit globals.css en de voorbeelden uit het register. Dun: de motor staat in
 * src/lib/systeem, de voorbeelden in voorbeelden.tsx, de teksten in teksten.ts.
 * De toegang loopt via de poort van /design (src/middleware.ts).
 */
export default function SysteemPagina() {
  const thema = leesThema("src/app/globals.css");
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{PAGINA.titel}</h1>
        <p className="max-w-xl text-sm">{PAGINA.intro}</p>
      </header>
      {TOKEN_GROEPEN.map((groep) =>
        thema[groep].length === 0 ? null : (
          <SysteemSectie key={groep} id={`tokens-${groep}`} titel={TOKENS[groep].titel} uitleg={TOKENS[groep].uitleg}>
            <TokenTabel thema={thema} groep={groep} voorbeeldtekst={PAGINA.tokenVoorbeeld} />
          </SysteemSectie>
        ),
      )}
      <Voorbeelden />
    </main>
  );
}
