type LoadStatus = "loading" | "error" | "ready";

/** Eén bron voor blokkade én uitleg; herladen data mag geen oude saldo-check gebruiken. */
export function checkoutBlockReason({
  memberSelected, cartHasLines, membersStatus, productsStatus,
  settingsStatus, crewStatus, rosterEmpty, insufficientFunds,
}: {
  memberSelected: boolean;
  cartHasLines: boolean;
  membersStatus: LoadStatus;
  productsStatus: LoadStatus;
  settingsStatus: LoadStatus;
  crewStatus: LoadStatus;
  rosterEmpty: boolean;
  insufficientFunds: boolean;
}): string | null {
  if (!memberSelected) return "Kies eerst een lid om af te rekenen.";
  if (!cartHasLines) return "Voeg een product toe om af te rekenen.";
  if (membersStatus === "error") return "Leden konden niet worden geladen. Probeer het opnieuw.";
  if (productsStatus === "error") return "Het assortiment kon niet worden geladen. Probeer het opnieuw.";
  if (settingsStatus === "error") return "De saldo-instellingen konden niet worden geladen. Probeer het opnieuw.";
  if (crewStatus === "error") return "De bezetting kon niet worden geladen. Probeer het opnieuw.";
  if (membersStatus !== "ready" || productsStatus !== "ready" || settingsStatus !== "ready" || crewStatus !== "ready") {
    return "De gegevens voor het afrekenen worden geladen…";
  }
  if (rosterEmpty) return "Voeg jezelf of een collega toe via Bezetting om af te rekenen.";
  if (insufficientFunds) return "Waardeer het saldo op om af te rekenen.";
  return null;
}
