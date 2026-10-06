/**
 * Teksten rond het contactadres van een lid
 * (docs/features/beheerformulieren-catalogus.md, "Teksten"; goedgekeurd door
 * Bram). Gedeeld door `LidBeherenOverlay` en `NieuwLidOverlay` zodat de term
 * op beide plekken gelijk is. Het Auth-inlogadres wordt nergens getoond of
 * gewijzigd (ADR 0004, ADR 0020).
 */
export const CONTACTADRES_LABEL = "Contactadres";
export const CONTACTADRES_UITLEG =
  "Hierheen stuurt ABAS de uitnodiging. Dit is niet automatisch het adres waarmee het lid inlogt.";
export const CONTACTADRES_UITLEG_ACCOUNT =
  "Dit lid heeft al een account. Een ander adres hier verandert het inlogadres niet; het lid blijft inloggen met het adres van het account (zichtbaar onder Mijn account in de portal).";
export const CONTACTADRES_UITLEG_UITNODIGING =
  "Een ander adres laat de openstaande uitnodiging vervallen; stuur daarna opnieuw een uitnodiging.";
export const CONTACTADRES_UITLEG_ZONDER_ADRES =
  "Zonder contactadres kan er geen uitnodiging worden gestuurd.";
export const CONTACTADRES_OPGESLAGEN = "Contactadres opgeslagen.";
export const CONTACTADRES_OPGESLAGEN_ACCOUNT =
  "Contactadres opgeslagen. Het inlogadres is niet gewijzigd.";
