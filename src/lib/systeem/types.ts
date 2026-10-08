// kit: generiek
import type { ReactNode } from "react";

/**
 * Het register van voorbeelden: sleutel = de naam van de component, waarde = een
 * functie die zijn voorbeeldsectie(s) rendert. Vaste voorbeelddata, geen netwerk.
 */
export type Voorbeeldregister = Record<string, () => ReactNode>;

/** Ondergrond van een sectie: een gewone pagina of een donkere strook. */
export type SysteemTone = "licht" | "rail";
