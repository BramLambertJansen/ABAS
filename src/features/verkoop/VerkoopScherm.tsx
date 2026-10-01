"use client";

import { useEffect, useMemo, useState } from "react";
import type { OpenShift } from "@/hooks/queries/useMijnDienst";
import { useProducts } from "@/hooks/queries/useProducts";
import { useMembers, type MemberOption } from "@/hooks/queries/useMembers";
import { useAppSettings } from "@/hooks/queries/useAppSettings";
import { useShiftMembers } from "@/hooks/queries/useShiftMembers";
import { formatCents } from "@/lib/money";
import { Assortiment } from "./Assortiment";
import { Mandje } from "./Mandje";
import { AfrekenenOverlay } from "./AfrekenenOverlay";
import { OpwaarderenOverlay } from "@/features/opwaarderen/OpwaarderenOverlay";
import { BezettingOverlay } from "@/features/bezetting-beheren/BezettingOverlay";
import { BezettingPil } from "@/features/bezetting-beheren/BezettingPil";
import { applyDelta, removeLine, type CartLine } from "./cart";
import { EMPTY_ROSTER_MESSAGE, placeOrderErrorMessage } from "./messages";
import { useMandjeMelding } from "@/features/bar-sessie/BarSessieContext";

const TOAST_DURATION_MS = 4000;

/**
 * Het verkoopscherm: assortiment (links) + mandje-paneel (rechts,
 * permanent zichtbaar). Zie docs/features/verkoop.md — dit component is
 * de orchestrator: het houdt mandje-/lidkeuze-state bij en berekent het
 * client-subtotaal en de negatieflimiet-bewuste onvoldoende-saldo-check
 * (nooit meegestuurd aan `place_order` — puur voor weergave/guards).
 */
export function VerkoopScherm({ shift }: { shift: OpenShift }) {
  const products = useProducts();
  const members = useMembers();
  const appSettings = useAppSettings();
  const crew = useShiftMembers(shift.id);
  const [bezettingOpen, setBezettingOpen] = useState(false);

  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  // Een gesloten sessie meldt dat het half ingevulde mandje niet is afgerekend
  // (docs/features/dienst-per-sessie.md → Teksten → Meldingen).
  useMandjeMelding(cartLines.length > 0);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  // Losstaand van selectedMemberId gehouden zodat clearMember() ("wissel")
  // het niet wist — chooseMember()'s keep-logica moet weten wie er vóór het
  // wisselen gekozen was, ook nadat selectedMemberId alweer null is (Reviewbot
  // op PR #41: clearMember() leegde het mandje altijd al vóórdat chooseMember
  // kon vergelijken, dus "opnieuw hetzelfde lid kiezen" kon het mandje nooit
  // intact laten zoals de spec voorschrijft — zie Schermflow §2).
  const [lastMemberId, setLastMemberId] = useState<string | null>(null);
  // Snapshot van het gekozen lid, i.p.v. elke render live uit memberList
  // afgeleid: useMembers().refetch() (na insufficient_balance/succes) zet
  // members.status eerst terug naar "loading" en leegt de array — een live
  // afleiding zou selectedMember dan even null maken en de open
  // afrekenbevestiging middenin de flow laten unmounten (checkoutOpen &&
  // selectedMember in de render hieronder). De snapshot blijft staan tot
  // een verse "ready"-lijst het bijgewerkte saldo levert, en wordt alleen
  // op een echte clear (wissel/succes/member_not_found) leeggemaakt.
  const [selectedMemberSnapshot, setSelectedMemberSnapshot] =
    useState<MemberOption | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const productList = useMemo(
    () => (products.status === "ready" ? products.products : []),
    [products]
  );

  // Alleen-aanvullende cache (nooit verwijderend) van productnaam/-prijs per
  // id, apart van de live productList. Nodig omdat cartDisplayLines anders
  // rechtstreeks van de live lijst afhing: na een refetch (bv. na
  // product_not_available, dat het gearchiveerde product uit productList
  // filtert) toonde elke bestaande mandjeregel voor dat product ineens
  // "onbekend product" à €0 i.p.v. de laatst bekende naam/prijs waarmee de
  // operator de regel nog kan beoordelen/verwijderen (Reviewbot op PR #41).
  // State i.p.v. een ref: zo blijft cartDisplayLines' useMemo hieronder een
  // gewone, eerlijke dependency houden i.p.v. via een ref-mutatie stiekem
  // mee te veranderen.
  const [productInfoCache, setProductInfoCache] = useState<
    Map<string, { name: string; priceCents: number }>
  >(new Map());
  useEffect(() => {
    setProductInfoCache((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const product of productList) {
        const existing = next.get(product.id);
        if (
          !existing ||
          existing.name !== product.name ||
          existing.priceCents !== product.priceCents
        ) {
          next.set(product.id, {
            name: product.name,
            priceCents: product.priceCents,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [productList]);

  const cartDisplayLines = useMemo(
    () =>
      cartLines.map((line) => {
        const cached = productInfoCache.get(line.productId);
        const unitPriceCents = cached?.priceCents ?? 0;
        return {
          productId: line.productId,
          qty: line.qty,
          name: cached?.name ?? "onbekend product",
          unitPriceCents,
          lineTotalCents: unitPriceCents * line.qty,
        };
      }),
    [cartLines, productInfoCache]
  );

  const subtotalCents = cartDisplayLines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  const memberList = members.status === "ready" ? members.members : [];
  const selectedMember = selectedMemberSnapshot;

  // Ververst de snapshot zodra een verse "ready"-ledenlijst het gekozen lid
  // bevat (bv. na een insufficient_balance-refetch) — nooit wanneer members
  // aan het (her)laden is of een andere status heeft, precies om het
  // hierboven beschreven unmount-probleem te voorkomen.
  useEffect(() => {
    if (!selectedMemberId || members.status !== "ready") return;
    const fresh = members.members.find((m) => m.id === selectedMemberId);
    if (fresh) setSelectedMemberSnapshot(fresh);
  }, [selectedMemberId, members]);

  const settingsReady = appSettings.status === "ready";
  const negativeLimitCents = settingsReady
    ? appSettings.settings.negativeLimitCents
    : 0;
  const lowBalanceThresholdCents = settingsReady
    ? appSettings.settings.lowBalanceThresholdCents
    : 0;

  // Zolang de instellingen (nog) niet geladen zijn, is negativeLimitCents=0
  // hierboven een placeholder, geen echte waarde — insufficientFunds daarop
  // baseren zou leden met een geldig, groter negatieflimiet ten onrechte
  // blokkeren (Reviewbot op PR #41). checkoutDisabled hieronder blokkeert
  // los daarvan al zolang settingsReady niet waar is.
  const insufficientFunds =
    settingsReady &&
    selectedMember !== null &&
    subtotalCents > selectedMember.balanceCents + negativeLimitCents;
  const shortfallCents = selectedMember
    ? subtotalCents - (selectedMember.balanceCents + negativeLimitCents)
    : 0;

  const crewList = crew.status === "ready" ? crew.members : [];
  const rosterEmpty = crew.status === "ready" && crewList.length === 0;
  // Blokkeert ook zolang de bezetting nog laadt of een foutmelding heeft —
  // rosterEmpty alleen dekte de "ready, maar leeg"-staat, niet "nog niet
  // bekend welke bezetting er is", wat een afrekenbevestiging zonder enige
  // crew (en dus zonder picker of auto-toewijzing) had kunnen openen
  // (Reviewbot op PR #41).
  const rosterUnavailable = crew.status !== "ready";

  const checkoutDisabled =
    selectedMember === null ||
    cartLines.length === 0 ||
    insufficientFunds ||
    rosterEmpty ||
    rosterUnavailable ||
    !settingsReady;

  // Opwaarderen heeft geen mandje/saldo-guard nodig (in tegenstelling tot
  // checkoutDisabled) — alleen dezelfde bezettings-eis: zonder een bekende,
  // niet-lege bezetting is er niemand om als served_by toe te wijzen (zie
  // docs/features/opwaarderen.md → Randgevallen, "Bezetting = 0").
  const topupDisabled = rosterEmpty || rosterUnavailable;

  // Eén functie voor beide oproepplekken: tikken op een product in het
  // assortiment (`onAdd`) en de +-stepper op een bestaande mandjeregel
  // (`onInc`) doen letterlijk hetzelfde — applyDelta() maakt zelf al geen
  // onderscheid tussen "regel bestaat nog niet" en "regel ophogen". Stonden
  // hiervoor als twee identieke functies naast elkaar (app-review
  // 2026-09-21).
  function inc(productId: string) {
    setCartLines((prev) => applyDelta(prev, productId, 1));
  }
  function dec(productId: string) {
    setCartLines((prev) => applyDelta(prev, productId, -1));
  }
  function remove(productId: string) {
    setCartLines((prev) => removeLine(prev, productId));
  }

  function chooseMember(id: string) {
    // "keep"-logica uit het ontwerp: een al opgebouwd mandje blijft intact
    // zolang er nog geen lid gekozen was, of hetzelfde lid opnieuw gekozen
    // wordt. Elk ander lid → leeg mandje (voorkomt per ongeluk afrekenen
    // bij de verkeerde persoon). Zie docs/features/verkoop.md → Schermflow
    // §2. Vergelijkt tegen lastMemberId, niet selectedMemberId — die laatste
    // is na "wissel" alweer null, lastMemberId overleeft dat bewust (zie
    // hierboven).
    if (!(lastMemberId === null || lastMemberId === id)) {
      setCartLines([]);
    }
    setSelectedMemberId(id);
    setSelectedMemberSnapshot(memberList.find((m) => m.id === id) ?? null);
    setLastMemberId(id);
    setMemberNotice(null);
  }

  function clearMember() {
    // Wist bewust alleen de "wie is gekozen"-staat, niet het mandje en niet
    // lastMemberId — anders kan chooseMember() hierboven nooit meer
    // detecteren dat hetzelfde lid opnieuw gekozen wordt (zie de keep-logica
    // hierboven en Reviewbot op PR #41).
    setSelectedMemberId(null);
    setSelectedMemberSnapshot(null);
    setMemberNotice(null);
  }

  function openCheckout() {
    if (checkoutDisabled) return;
    setCheckoutOpen(true);
  }

  function handleCheckoutSuccess(totalCents: number) {
    setCartLines([]);
    setSelectedMemberId(null);
    setSelectedMemberSnapshot(null);
    setLastMemberId(null);
    setCheckoutOpen(false);
    setToast(`Afgerekend — ${formatCents(totalCents)}.`);
    members.refetch();
  }

  function openTopup() {
    if (selectedMember === null || topupDisabled) return;
    setTopupOpen(true);
  }

  // Opwaarderen wijzigt geen mandje-state (in tegenstelling tot
  // handleCheckoutSuccess) — het gekozen lid en het mandje blijven intact,
  // alleen het saldo is bijgewerkt server-side. Zie
  // docs/features/opwaarderen.md → Schermflow §2.
  function handleTopupSuccess(amountCents: number) {
    setTopupOpen(false);
    setToast(`Opgewaardeerd — ${formatCents(amountCents)}.`);
    members.refetch();
  }

  function handleMemberNotFound() {
    setSelectedMemberId(null);
    setSelectedMemberSnapshot(null);
    setLastMemberId(null);
    setCheckoutOpen(false);
    setTopupOpen(false);
    setMemberNotice(placeOrderErrorMessage("member_not_found"));
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden px-[26px] pb-[22px] pt-6">
        <header className="flex flex-none flex-wrap items-center gap-3.5">
          <h1 className="text-[25px] font-extrabold leading-none tracking-[-0.025em] text-ink">
            Bar
          </h1>
          <BezettingPil
            members={crewList}
            loading={crew.status === "loading"}
            onOpen={() => setBezettingOpen(true)}
          />
        </header>
        {products.status === "loading" && (
          <p className="flex flex-1 items-center justify-center text-sm font-semibold text-muted" role="status">
            Assortiment laden…
          </p>
        )}
        {products.status === "error" && (
          <p className="flex flex-1 items-center justify-center text-sm font-semibold text-danger" role="alert">
            {products.message}
          </p>
        )}
        {products.status === "ready" && (
          <Assortiment products={productList} cart={cartLines} onAdd={inc} />
        )}
      </div>

      <Mandje
        members={memberList}
        membersStatus={members.status}
        membersErrorMessage={members.status === "error" ? members.message : null}
        lowBalanceThresholdCents={lowBalanceThresholdCents}
        selectedMember={selectedMember}
        onSelectMember={chooseMember}
        onClearMember={clearMember}
        memberNotice={memberNotice}
        cartLines={cartDisplayLines}
        subtotalCents={subtotalCents}
        insufficientFunds={insufficientFunds}
        shortfallCents={shortfallCents}
        onInc={inc}
        onDec={dec}
        onRemove={remove}
        rosterEmpty={rosterEmpty}
        rosterEmptyMessage={EMPTY_ROSTER_MESSAGE}
        checkoutDisabled={checkoutDisabled}
        onOpenCheckout={openCheckout}
        topupDisabled={topupDisabled}
        onOpenTopup={openTopup}
      />

      {bezettingOpen && (
        <BezettingOverlay
          shiftId={shift.id}
          members={crewList}
          membersStatus={crew.status}
          onMembersChanged={crew.refetch}
          onClose={() => setBezettingOpen(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center"
        >
          <span className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-lg">
            {toast}
          </span>
        </div>
      )}

      {checkoutOpen && selectedMember && (
        <AfrekenenOverlay
          shiftId={shift.id}
          member={selectedMember}
          crew={crewList}
          lines={cartDisplayLines}
          subtotalCents={subtotalCents}
          negativeLimitCents={negativeLimitCents}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleCheckoutSuccess}
          onMemberNotFound={handleMemberNotFound}
          onRefetchMembers={members.refetch}
          onRefetchProducts={products.refetch}
          onRefetchShiftMembers={crew.refetch}
        />
      )}

      {topupOpen && selectedMember && (
        <OpwaarderenOverlay
          shiftId={shift.id}
          member={selectedMember}
          crew={crewList}
          lowBalanceThresholdCents={lowBalanceThresholdCents}
          onClose={() => setTopupOpen(false)}
          onSuccess={handleTopupSuccess}
          onMemberNotFound={handleMemberNotFound}
          onRefetchMembers={members.refetch}
          onRefetchShiftMembers={crew.refetch}
        />
      )}
    </div>
  );
}
