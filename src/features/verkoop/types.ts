/** Mandje-regel met alle weergave-info erbij (naam, stukprijs, regeltotaal)
 *  — afgeleid van `CartLine` + de al-geladen productlijst, nooit
 *  losstaand bijgehouden. `unitPriceCents`/`lineTotalCents` zijn puur voor
 *  weergave; `place_order` krijgt alleen `productId`/`qty` (zie
 *  usePlaceOrder.ts → PlaceOrderLine). */
export type CartDisplayLine = {
  productId: string;
  qty: number;
  name: string;
  unitPriceCents: number;
  lineTotalCents: number;
};
