// kit: generiek

const RAND = "1px solid color-mix(in srgb, currentColor 30%, transparent)";

/** Eén uitzondering uit de lokale config: een code en een optionele toelichting. */
export type Uitzondering = { code: string; toelichting?: string };

/** Een los venster met zijn adres en de componenten die het toont. */
export type VensterLink = { id: string; naam: string; href: string; componenten: readonly string[] };

export type NietOpDezePaginaTeksten = {
  caption: string;
  kolommen: { component: string; code: string; toelichting: string };
  vensterKop: string;
  geenUitzonderingen: string;
};

/**
 * De componenten die niet als voorbeeld op de systeempagina staan: een tabel
 * van uitzonderingen (naam, code, toelichting; alfabetisch) en, als er vensters
 * zijn, een lijst met links naar de losse vensters in de volgorde van de config.
 * Rendert alleen de inhoud; de sectie en haar kop levert de aanroeper.
 */
export function NietOpDezePagina({
  uitzonderingen,
  vensters = [],
  teksten,
}: {
  uitzonderingen: Readonly<Record<string, Uitzondering>>;
  vensters?: readonly VensterLink[];
  teksten: NietOpDezePaginaTeksten;
}) {
  const rijen: Array<[string, Uitzondering]> = Object.entries(uitzonderingen).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return (
    <>
      {rijen.length === 0 ? (
        <p className="text-sm">{teksten.geenUitzonderingen}</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{teksten.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2 font-semibold" style={{ borderBottom: RAND }}>
                {teksten.kolommen.component}
              </th>
              <th scope="col" className="p-2 font-semibold" style={{ borderBottom: RAND }}>
                {teksten.kolommen.code}
              </th>
              <th scope="col" className="p-2 font-semibold" style={{ borderBottom: RAND }}>
                {teksten.kolommen.toelichting}
              </th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(([naam, { code, toelichting }]) => {
              const tekst = typeof toelichting === "string" ? toelichting.trim() : "";
              return (
                <tr key={naam}>
                  <th scope="row" className="p-2 align-top font-mono font-semibold" style={{ borderBottom: RAND }}>
                    {naam}
                  </th>
                  <td className="p-2 align-top" style={{ borderBottom: RAND }}>
                    <code className="font-mono">{code}</code>
                  </td>
                  <td className="p-2 align-top" style={{ borderBottom: RAND }}>
                    {tekst === "" ? "—" : tekst}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {vensters.length === 0 ? null : (
        <>
          <h3 className="text-base font-bold">{teksten.vensterKop}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {vensters.map((venster) => (
              <li key={venster.id}>
                <a
                  href={venster.href}
                  className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {venster.naam}
                </a>{" "}
                <span className="font-mono">({venster.componenten.join(", ")})</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
