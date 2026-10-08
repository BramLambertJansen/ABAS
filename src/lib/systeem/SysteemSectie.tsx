// kit: generiek
import type { ReactNode } from "react";
import type { SysteemTone } from "./types";

const BASIS = "flex flex-col gap-4 p-4";

/**
 * Eén onderdeel van de systeempagina: een `<section>` met `id` en
 * `data-systeem` (de sleutel voor een screenshot per onderdeel) en een `h2`.
 * `tone="rail"` zet de inhoud op een donkere strook; de klassen daarvoor levert
 * het project via `railKlassen`, zodat dit bestand geen tokennamen kent.
 */
export function SysteemSectie({
  id,
  titel,
  uitleg,
  tone = "licht",
  railKlassen,
  children,
}: {
  id: string;
  titel: string;
  uitleg?: string;
  tone?: SysteemTone;
  railKlassen?: string;
  children: ReactNode;
}) {
  const klassen = tone === "rail" && railKlassen ? `${BASIS} ${railKlassen}` : BASIS;
  return (
    <section id={id} data-systeem={id} aria-labelledby={`${id}-titel`} className={klassen}>
      <h2 id={`${id}-titel`} className="text-lg font-bold">
        {titel}
      </h2>
      {uitleg ? <p className="max-w-xl text-sm">{uitleg}</p> : null}
      {children}
    </section>
  );
}
