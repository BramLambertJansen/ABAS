"use client";

import type { ReactNode } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { Knop } from "@/components/Knop";
import { Overlay, OverlaySluitKnop } from "@/components/Overlay";
import { OverlayPresenceProvider, useOpenOverlayCount } from "@/components/OverlayPresence";
import { RoleBadge } from "@/components/RoleBadge";
import { StartScherm } from "@/components/StartScherm";
import { TekstVeld } from "@/components/TekstVeld";
import { ZijPaneel } from "@/components/ZijPaneel";
import { formatCents } from "@/lib/money";
import { OPSLAAN_BEZIG_TEKST } from "@/lib/opslaan";
import { ShellProvider } from "@/lib/shell/ShellProvider";
import type { Vensterregister } from "@/lib/systeem/types";
import { barCapabilities } from "@/shells/bar/capabilities";
import { portalCapabilities } from "@/shells/portal/capabilities";
import { VENSTER_TEKSTEN, type VensterId } from "./teksten";

/** Een venster sluiten valt buiten scope (spec, besluit 7): Escape, backdrop
 *  en de sluitknoppen doen niets. */
const noop = () => undefined;

/** De bar-shell: Overlay rendert als gecentreerde modal. */
function Modal({ children }: { children: ReactNode }) {
  return <ShellProvider value={barCapabilities}>{children}</ShellProvider>;
}

/** De portal-shell: Overlay rendert als sheet onderaan. */
function Sheet({ children }: { children: ReactNode }) {
  return <ShellProvider value={portalCapabilities}>{children}</ShellProvider>;
}

/** Het formulier van de modal-vensters: één veld en Annuleren + Opslaan. */
function PrijsOverlay({
  id,
  closeBlocked = false,
  onopgeslagen = false,
}: {
  id: "overlay-modal" | "overlay-bezig" | "overlay-onopgeslagen";
  closeBlocked?: boolean;
  onopgeslagen?: boolean;
}) {
  const T = VENSTER_TEKSTEN[id];
  return (
    <Overlay
      title={T.titel}
      description={T.beschrijving}
      onClose={noop}
      closeBlocked={closeBlocked}
      onopgeslagen={onopgeslagen}
    >
      <TekstVeld tone="light" label={T.veldLabel} defaultValue={T.waarde} readOnly={closeBlocked} inputMode="decimal" />
      <div className="flex gap-2.5">
        <OverlaySluitKnop className="flex-1" disabled={closeBlocked}>
          {T.annuleren}
        </OverlaySluitKnop>
        <Knop variant="primair" className="flex-1" disabled={closeBlocked}>
          {closeBlocked ? OPSLAAN_BEZIG_TEKST : T.opslaan}
        </Knop>
      </div>
    </Overlay>
  );
}

/** `variant="detail"` met `meta`; genoeg secties om het lichaam te laten scrollen. */
function DetailOverlay({ id }: { id: "overlay-modal-detail" | "overlay-sheet-detail" }) {
  const T = VENSTER_TEKSTEN[id];
  return (
    <Overlay
      title={T.titel}
      description={T.beschrijving}
      onClose={noop}
      variant="detail"
      meta={
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <RoleBadge role={T.rol} tone="light" />
          <span className="text-sm font-extrabold text-ink">
            {T.saldoLabel} {formatCents(T.saldoCents)}
          </span>
        </div>
      }
    >
      {T.secties.map((sectie) => (
        <section key={sectie.kop} className="flex flex-col gap-1">
          <h3 className="text-section-title font-extrabold text-ink">{sectie.kop}</h3>
          <p className="text-sm text-muted">{sectie.tekst}</p>
        </section>
      ))}
    </Overlay>
  );
}

/** De teller staat ín de dialoog: achter de backdrop is hij inert. */
function OverlayTeller() {
  const aantal = useOpenOverlayCount();
  return (
    <p className="text-sm font-bold text-ink">
      {VENSTER_TEKSTEN["overlay-presence-provider"].teller} {aantal}
    </p>
  );
}

function ZijPaneelRij({ id }: { id: "zij-paneel" | "zij-paneel-smal" }) {
  const T = VENSTER_TEKSTEN[id];
  return (
    // Zonder eigen breekpunt: ZijPaneel is onder 700px volle breedte en
    // springt dan zelf naar een eigen regel; daarboven staat hij naast de inhoud.
    <div className="flex min-h-screen flex-wrap">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-3 bg-canvas p-6">
        <h2 className="text-section-title font-extrabold text-ink">{T.inhoudKop}</h2>
        <p className="text-sm text-muted">{T.inhoudTekst}</p>
      </div>
      <ZijPaneel as="aside">
        <h2 className="text-section-title font-extrabold text-ink">{T.paneelKop}</h2>
        <p className="text-sm text-muted">{T.paneelTekst}</p>
      </ZijPaneel>
    </div>
  );
}

/**
 * De inhoud van elk los venster (docs/features/ontwerpsysteem-uitzonderingen.md
 * → Vensters). Getypt op de ids uit systeem.lokaal.json: een ontbrekend of
 * extra venster faalt in typecheck. Vaste voorbeelddata, geen netwerk.
 */
export const VENSTERS: Vensterregister<VensterId> = {
  "overlay-modal": () => (
    <Modal>
      <PrijsOverlay id="overlay-modal" />
    </Modal>
  ),
  "overlay-modal-detail": () => (
    <Modal>
      <DetailOverlay id="overlay-modal-detail" />
    </Modal>
  ),
  "overlay-sheet": () => {
    const T = VENSTER_TEKSTEN["overlay-sheet"];
    return (
      <Sheet>
        <Overlay title={T.titel} description={T.beschrijving} onClose={noop}>
          <TekstVeld tone="light" label={T.veldLabel} defaultValue={T.waarde} />
          <div className="flex gap-2.5">
            <OverlaySluitKnop maat="groot" className="flex-1">
              {T.annuleren}
            </OverlaySluitKnop>
            <Knop variant="primair" maat="groot" className="flex-1">
              {T.opslaan}
            </Knop>
          </div>
        </Overlay>
      </Sheet>
    );
  },
  "overlay-sheet-detail": () => (
    <Sheet>
      <DetailOverlay id="overlay-sheet-detail" />
    </Sheet>
  ),
  "overlay-bezig": () => (
    <Modal>
      <PrijsOverlay id="overlay-bezig" closeBlocked />
    </Modal>
  ),
  "overlay-onopgeslagen": () => (
    <Modal>
      <PrijsOverlay id="overlay-onopgeslagen" onopgeslagen />
    </Modal>
  ),
  "overlay-sluit-knop": () => {
    const T = VENSTER_TEKSTEN["overlay-sluit-knop"];
    return (
      <Modal>
        <Overlay title={T.titel} description={T.beschrijving} onClose={noop}>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink">{T.vormen.secundair}</h3>
            <OverlaySluitKnop>{T.knop}</OverlaySluitKnop>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink">{T.vormen.tekst}</h3>
            <OverlaySluitKnop variant="tekst">{T.knop}</OverlaySluitKnop>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink">{T.vormen.groot}</h3>
            <OverlaySluitKnop maat="groot">{T.knop}</OverlaySluitKnop>
          </div>
        </Overlay>
      </Modal>
    );
  },
  "overlay-presence-provider": () => {
    const T = VENSTER_TEKSTEN["overlay-presence-provider"];
    return (
      <Modal>
        <OverlayPresenceProvider>
          <Overlay title={T.titel} description={T.beschrijving} onClose={noop}>
            <OverlayTeller />
          </Overlay>
        </OverlayPresenceProvider>
      </Modal>
    );
  },
  "start-scherm": () => (
    <StartScherm>
      <AuroraMerk tone="dark">
        <h1 className="text-screen-title font-extrabold tracking-tight">{VENSTER_TEKSTEN["start-scherm"].titel}</h1>
      </AuroraMerk>
    </StartScherm>
  ),
  "zij-paneel": () => <ZijPaneelRij id="zij-paneel" />,
  "zij-paneel-smal": () => <ZijPaneelRij id="zij-paneel-smal" />,
};

/** De inhoud van één venster; de route (een servercomponent) geeft alleen het id door. */
export function VensterInhoud({ id }: { id: VensterId }) {
  return VENSTERS[id]();
}
