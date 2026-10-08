// kit: generiek
import type { Thema, ThemaGroep, ThemaToken } from "./leesThema";

const RAND = "1px solid color-mix(in srgb, currentColor 30%, transparent)";

function Label({ token }: { token: ThemaToken }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="font-mono font-bold break-all">{token.naam}</span>
      <span className="font-mono break-all">{token.waarde}</span>
    </span>
  );
}

function Voorbeeld({ groep, token, voorbeeldtekst }: { groep: ThemaGroep; token: ThemaToken; voorbeeldtekst: string }) {
  // Tailwind v4 schrijft alleen gebruikte tokens als custom property uit; de
  // fallback houdt een (nog) ongebruikt token zichtbaar met zijn eigen waarde.
  const variabele = `var(${token.naam}, ${token.waarde})`;
  switch (groep) {
    case "kleuren":
      return <span aria-hidden="true" className="block h-12 w-12 flex-none" style={{ backgroundColor: variabele, border: RAND, borderRadius: "0.5rem" }} />;
    case "hoogtes":
      return <span aria-hidden="true" className="block flex-none" style={{ height: variabele, width: "8rem", backgroundColor: "currentColor", opacity: 0.25 }} />;
    case "radii":
      return <span aria-hidden="true" className="block h-16 w-16 flex-none" style={{ borderRadius: variabele, border: "2px solid currentColor" }} />;
    case "schaduwen":
      return <span aria-hidden="true" className="block h-12 w-20 flex-none" style={{ boxShadow: variabele, backgroundColor: "Canvas", borderRadius: "0.5rem" }} />;
    case "tekstmaten":
      return <span className="flex-none" style={{ fontSize: variabele }}>{voorbeeldtekst}</span>;
    case "overig":
      return null;
  }
}

/**
 * Toont één groep tokens uit het resultaat van `leesThema`: kleuren als vakjes,
 * hoogtes als balkjes, radii en schaduwen als vakjes, tekstmaten als voorbeeld-
 * tekst en de rest als lijst. Uitsluitend inline `style` met `var(--…)`, zodat
 * er geen klasse van de tokens zelf nodig is.
 */
export function TokenTabel({
  thema,
  groep,
  voorbeeldtekst,
}: {
  thema: Thema;
  groep: ThemaGroep;
  voorbeeldtekst: string;
}) {
  const tokens = thema[groep];
  if (tokens.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {tokens.map((token) => (
        <li key={token.naam} className="flex min-w-0 items-center gap-3">
          <Voorbeeld groep={groep} token={token} voorbeeldtekst={voorbeeldtekst} />
          <Label token={token} />
        </li>
      ))}
    </ul>
  );
}
