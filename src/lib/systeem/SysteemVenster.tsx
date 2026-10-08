// kit: generiek
import type { ReactNode } from "react";

/**
 * De schil van een los venster: precies één `main` en één `h1` per document.
 * Zonder `eigenLandmark` rendert hij een `main` met een visueel verborgen `h1`
 * (de vensternaam) en de inhoud; een overlay in de inhoud maakt die `h1` als
 * sibling inert, zodat er achter de backdrop geen zichtbare tekst staat. Met
 * `eigenLandmark` levert het voorbeeld zelf de `main` en de `h1` en rendert
 * de schil alleen de inhoud.
 */
export function SysteemVenster({
  naam,
  eigenLandmark = false,
  children,
}: {
  naam: string;
  eigenLandmark?: boolean;
  children: ReactNode;
}) {
  if (eigenLandmark) return <>{children}</>;
  return (
    <main>
      <h1 className="sr-only">{naam}</h1>
      {children}
    </main>
  );
}
