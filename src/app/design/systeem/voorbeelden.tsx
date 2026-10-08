"use client";

import { Fragment, useState, type ReactNode } from "react";
import { AuroraMerk } from "@/components/AuroraMerk";
import { BezettingKeuze } from "@/components/BezettingKeuze";
import { Chip } from "@/components/Chip";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { Knop, type KnopMaat, type KnopTone, type KnopVariant } from "@/components/Knop";
import { LeesFout } from "@/components/LeesFout";
import { MemberPill } from "@/components/MemberPill";
import { PinToetsenbord } from "@/components/PinToetsenbord";
import { ProductAfbeelding } from "@/components/ProductAfbeelding";
import { RoleBadge } from "@/components/RoleBadge";
import { Segment, SegmentBalk } from "@/components/Segment";
import { Select } from "@/components/Select";
import { StatCard } from "@/components/StatCard";
import { StatusFilter } from "@/components/StatusFilter";
import { TabList, TabPanel } from "@/components/Tabs";
import { TekstVeld, VeldFout } from "@/components/TekstVeld";
import { Toets } from "@/components/Toets";
import { VerversStatus } from "@/components/VerversStatus";
import { ZoekIcoon } from "@/components/ZoekIcoon";
import { ZoekVeld } from "@/components/ZoekVeld";
import { SysteemSectie } from "@/lib/systeem/SysteemSectie";
import type { SysteemTone, Voorbeeldregister } from "@/lib/systeem/types";
import { STATEN, VOORBEELD_TEKSTEN } from "./teksten";

/** De donkere strook van rail-secties (project: ABAS). */
const RAIL = "bg-rail text-white rounded-card";

const noop = () => undefined;

const VARIANTEN = ["primair", "secundair", "gevaar", "tekst"] as const satisfies readonly KnopVariant[];
const MATEN = ["normaal", "groot"] as const satisfies readonly KnopMaat[];

/** "PinToetsenbord" wordt "pin-toetsenbord": het stabiele id van een sectie. */
function kebab(naam: string): string {
  return naam.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Componenten die alleen op een rail bestaan: hun enige sectie heet zonder `-rail`. */
const RAIL_ALLEEN = new Set(["Select"]);

function Sectie({
  naam,
  tone = "licht",
  titel,
  uitleg,
  children,
}: {
  naam: string;
  tone?: SysteemTone;
  titel: string;
  uitleg: string;
  children: ReactNode;
}) {
  return (
    <SysteemSectie
      id={tone === "rail" && !RAIL_ALLEEN.has(naam) ? `${kebab(naam)}-rail` : kebab(naam)}
      titel={titel}
      uitleg={uitleg}
      tone={tone}
      railKlassen={RAIL}
    >
      {children}
    </SysteemSectie>
  );
}

function Groep({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">{titel}</h3>
      {children}
    </div>
  );
}

function Rij({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

/** Het witte dialoogvlak waar sommige bouwstenen in horen te staan. */
function Dialoogvlak({ children }: { children: ReactNode }) {
  return <div className="flex max-w-md flex-col gap-3 rounded-panel bg-surface p-4 text-ink">{children}</div>;
}

function Rooster({
  naam,
  kolommen,
  rijen,
}: {
  naam: string;
  kolommen: readonly string[];
  rijen: Array<{ label: string; cellen: ReactNode[] }>;
}) {
  return (
    <table className="border-separate border-spacing-2 text-left text-xs">
      <caption className="sr-only">{naam}</caption>
      <thead>
        <tr>
          <td />
          {kolommen.map((kolom) => (
            <th key={kolom} scope="col" className="font-semibold">
              {kolom}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rijen.map((rij) => (
          <tr key={rij.label}>
            <th scope="row" className="font-semibold">
              {rij.label}
            </th>
            {rij.cellen.map((cel, i) => (
              <td key={i}>{cel}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- Knop -----------------------------------------------------------------

function KnopMatrix({ tone }: { tone: KnopTone }) {
  const T = VOORBEELD_TEKSTEN.Knop;
  const rijen = MATEN.flatMap((maat) =>
    VARIANTEN.map((variant) => {
      const tekst = T.varianten[variant];
      return {
        label: `${tekst}, ${STATEN[maat]}`,
        cellen: [
          <Knop key="rust" variant={variant} tone={tone} maat={maat}>{tekst}</Knop>,
          <Knop key="disabled" variant={variant} tone={tone} maat={maat} disabled>{tekst}</Knop>,
          <Knop key="aria" variant={variant} tone={tone} maat={maat} aria-disabled>{tekst}</Knop>,
        ],
      };
    }),
  );
  return (
    <>
      <Rooster naam={T.titel} kolommen={T.kolommen} rijen={rijen} />
      <Groep titel={T.icoonKop}>
        <Rij>
          {VARIANTEN.map((variant) => (
            <Knop key={variant} variant={variant} tone={tone} icoon aria-label={T.icoonNaam}>{T.icoonTeken}</Knop>
          ))}
        </Rij>
      </Groep>
      <Groep titel={T.linkKop}>
        <Rij>
          {VARIANTEN.map((variant) => (
            <Knop key={variant} variant={variant} tone={tone} href={T.linkAdres}>{T.varianten[variant]}</Knop>
          ))}
        </Rij>
      </Groep>
    </>
  );
}

function KnopVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.Knop;
  return (
    <>
      <Sectie naam="Knop" titel={T.titel} uitleg={T.uitleg}>
        <KnopMatrix tone="licht" />
      </Sectie>
      <Sectie naam="Knop" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <KnopMatrix tone="rail" />
      </Sectie>
    </>
  );
}

// --- Chip, Segment ----------------------------------------------------------

function ChipVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.Chip;
  return (
    <Sectie naam="Chip" titel={T.titel} uitleg={T.uitleg}>
      <Rooster
        naam={T.titel}
        kolommen={T.staten}
        rijen={MATEN.map((maat) => ({
          label: STATEN[maat],
          cellen: [
            <Chip key="rust" maat={maat} geselecteerd={false}>{T.label}</Chip>,
            <Chip key="geselecteerd" maat={maat} geselecteerd>{T.label}</Chip>,
            <Chip key="uitgeschakeld" maat={maat} geselecteerd={false} disabled>{T.label}</Chip>,
            <Chip key="zonder" maat={maat}>{T.label}</Chip>,
          ],
        }))}
      />
    </Sectie>
  );
}

function SegmentVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.Segment;
  return (
    <Sectie naam="Segment" titel={T.titel} uitleg={T.uitleg}>
      <Rij>
        {MATEN.map((maat) => (
          <SegmentBalk key={maat} aria-label={`${T.balkNaam}, ${STATEN[maat]}`} role="group">
            <Segment maat={maat} geselecteerd={false}>{T.staten.rust}</Segment>
            <Segment maat={maat} geselecteerd>{T.staten.geselecteerd}</Segment>
            <Segment maat={maat} geselecteerd={false} disabled>{T.staten.uitgeschakeld}</Segment>
          </SegmentBalk>
        ))}
      </Rij>
    </Sectie>
  );
}

function SegmentBalkVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.SegmentBalk;
  return (
    <Sectie naam="SegmentBalk" titel={T.titel} uitleg={T.uitleg}>
      <SegmentBalk role="group" aria-label={T.balkNaam}>
        {T.opties.map((optie, i) => (
          <Segment key={optie} geselecteerd={i === 1}>{optie}</Segment>
        ))}
      </SegmentBalk>
    </Sectie>
  );
}

// --- Tabs -------------------------------------------------------------------

function TabsDemo({
  stijl,
  idBase,
  label,
  activation = "automatic",
}: {
  stijl: "segment" | "eigen";
  idBase: string;
  label: string;
  activation?: "automatic" | "manual";
}) {
  const T = VOORBEELD_TEKSTEN.TabList;
  const [gekozen, setGekozen] = useState("een");
  const inhoud = T.tabs.find((tab) => tab.key === gekozen)?.inhoud;
  return (
    <div className="flex flex-col gap-3">
      {stijl === "segment" ? (
        <TabList
          idBase={idBase}
          label={label}
          stijl="segment"
          activation={activation}
          selected={gekozen}
          onSelect={setGekozen}
          items={T.tabs.map(({ key, label: tabLabel }) => ({ key, label: tabLabel }))}
        />
      ) : (
        <TabList
          idBase={idBase}
          label={label}
          className="flex gap-2"
          activation={activation}
          selected={gekozen}
          onSelect={setGekozen}
          items={T.tabs.map(({ key, label: tabLabel }) => ({
            key,
            label: tabLabel,
            className: (geselecteerd: boolean) =>
              geselecteerd
                ? "h-control rounded-control bg-ink px-4 text-sm font-bold text-white"
                : "h-control rounded-control px-4 text-sm font-semibold text-muted-strong hover:text-ink",
          }))}
        />
      )}
      <TabPanel idBase={idBase} tabKey={gekozen} className="text-sm">
        {inhoud}
      </TabPanel>
    </div>
  );
}

function TabListVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.TabList;
  return (
    <Sectie naam="TabList" titel={T.titel} uitleg={T.uitleg}>
      <Groep titel={T.segmentKop}>
        <TabsDemo stijl="segment" idBase="systeem-tabs-segment" label={T.segmentNaam} />
      </Groep>
      <Groep titel={T.eigenKop}>
        <TabsDemo stijl="eigen" idBase="systeem-tabs-eigen" label={T.eigenNaam} />
      </Groep>
    </Sectie>
  );
}

function TabPanelVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.TabPanel;
  return (
    <Sectie naam="TabPanel" titel={T.titel} uitleg={T.uitleg}>
      <TabsDemo stijl="segment" idBase="systeem-tabs-handmatig" label={T.tabsNaam} activation="manual" />
    </Sectie>
  );
}

// --- Toets, PinToetsenbord ----------------------------------------------------

function ToetsVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.Toets;
  return (
    <>
      <Sectie naam="Toets" titel={T.titel} uitleg={T.uitleg}>
        <Rooster
          naam={T.titel}
          kolommen={T.kolommen}
          rijen={[
            {
              label: T.rijen.keypadLicht,
              cellen: [
                <Toets key="rust" soort="keypad" tone="licht" aria-label={T.cijferNaam}>{T.cijfer}</Toets>,
                <Toets key="uit" soort="keypad" tone="licht" aria-label={T.cijferNaam} disabled>{T.cijfer}</Toets>,
              ],
            },
            {
              label: T.rijen.stap,
              cellen: [
                <Rij key="rust">
                  <Toets soort="stap" aria-label={T.minderNaam}>{T.minderTeken}</Toets>
                  <Toets soort="stap" aria-label={T.meerNaam}>{T.meerTeken}</Toets>
                </Rij>,
                <Rij key="uit">
                  <Toets soort="stap" aria-label={T.minderNaam} disabled>{T.minderTeken}</Toets>
                  <Toets soort="stap" aria-label={T.meerNaam} disabled>{T.meerTeken}</Toets>
                </Rij>,
              ],
            },
          ]}
        />
      </Sectie>
      <Sectie naam="Toets" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <Rooster
          naam={T.rail.titel}
          kolommen={T.kolommen}
          rijen={[
            {
              label: T.rijen.keypadRail,
              cellen: [
                <Toets key="rust" soort="keypad" tone="rail" aria-label={T.cijferNaam}>{T.cijfer}</Toets>,
                <Toets key="uit" soort="keypad" tone="rail" aria-label={T.cijferNaam} disabled>{T.cijfer}</Toets>,
              ],
            },
          ]}
        />
      </Sectie>
    </>
  );
}

function PinToetsenbordVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.PinToetsenbord;
  const pin = (tone: "light" | "rail", fout: string | null, statusLabel: string) => (
    <div className="flex w-72 flex-col gap-3">
      <PinToetsenbord pin="12" errorMessage={fout} pending={false} onDigit={noop} onBackspace={noop} tone={tone} statusLabel={statusLabel} />
    </div>
  );
  return (
    <>
      <Sectie naam="PinToetsenbord" titel={T.titel} uitleg={T.uitleg}>
        <Groep titel={T.licht}>{pin("light", null, `${T.statusLabel} (${T.licht})`)}</Groep>
      </Sectie>
      <Sectie naam="PinToetsenbord" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <Rij>
          <Groep titel={T.railZonderFout}>{pin("rail", null, `${T.statusLabel} (${T.railZonderFout})`)}</Groep>
          <Groep titel={T.railMetFout}>{pin("rail", T.foutmelding, `${T.statusLabel} (${T.railMetFout})`)}</Groep>
        </Rij>
      </Sectie>
    </>
  );
}

// --- Velden -----------------------------------------------------------------

function TekstVeldReeks({ tone }: { tone: "light" | "rail" }) {
  const T = VOORBEELD_TEKSTEN.TekstVeld;
  const id = (staat: string) => `systeem-tekstveld-${tone}-${staat}`;
  // Hint en fout zijn alleen op licht getoond: TekstVeld kleurt ze niet naar de
  // tone (text-muted en text-danger op rail halen 3,5:1 en 3,4:1). Zie het rapport.
  const licht = tone === "light";
  return (
    <Rij>
      <TekstVeld id={id("rust")} tone={tone} label={T.labels.rust} hint={licht ? T.hint : undefined} className="w-64" />
      <TekstVeld id={id("gevuld")} tone={tone} label={T.labels.gevuld} defaultValue={T.waarde} className="w-64" />
      {licht ? (
        <TekstVeld id={id("fout")} tone={tone} label={T.labels.fout} defaultValue="" fout={T.foutmelding} className="w-64" />
      ) : null}
      <TekstVeld id={id("uitgeschakeld")} tone={tone} label={T.labels.uitgeschakeld} defaultValue={T.waarde} disabled className="w-64" />
    </Rij>
  );
}

function TekstVeldVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.TekstVeld;
  return (
    <>
      <Sectie naam="TekstVeld" titel={T.titel} uitleg={T.uitleg}>
        <TekstVeldReeks tone="light" />
      </Sectie>
      <Sectie naam="TekstVeld" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <TekstVeldReeks tone="rail" />
      </Sectie>
    </>
  );
}

function ZoekVeldVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.ZoekVeld;
  return (
    <Sectie naam="ZoekVeld" titel={T.titel} uitleg={T.uitleg}>
      <Rij>
        <div className="w-72">
          <ZoekVeld id="systeem-zoekveld-leeg" label={T.labelLeeg} waarde="" onChange={noop} placeholder={T.placeholder} />
        </div>
        <div className="w-72">
          <ZoekVeld id="systeem-zoekveld-gevuld" label={T.labelGevuld} waarde={T.waarde} onChange={noop} placeholder={T.placeholder} />
        </div>
      </Rij>
    </Sectie>
  );
}

function SelectVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.Select;
  const opties = T.opties.map((optie) => ({ ...optie }));
  return (
    <Sectie naam="Select" tone="rail" titel={T.titel} uitleg={T.uitleg}>
      <Rij>
        <div className="w-64"><Select label={T.labels.rust} options={opties} value={null} placeholder={T.placeholder} onChange={noop} /></div>
        <div className="w-64"><Select label={T.labels.gevuld} options={opties} value={T.gekozen} placeholder={T.placeholder} onChange={noop} /></div>
        <div className="w-64"><Select label={T.labels.fout} options={opties} value={null} placeholder={T.placeholder} onChange={noop} invalid /></div>
        <div className="w-64"><Select label={T.labels.uitgeschakeld} options={opties} value={T.gekozen} placeholder={T.placeholder} onChange={noop} disabled /></div>
      </Rij>
    </Sectie>
  );
}

function VeldFoutVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.VeldFout;
  return (
    <Sectie naam="VeldFout" titel={T.titel} uitleg={T.uitleg}>
      <Rij>
        <Groep titel={T.stil}><VeldFout id="systeem-veldfout-stil" tekst={T.tekst} /></Groep>
        <Groep titel={T.alert}><VeldFout id="systeem-veldfout-alert" tekst={T.tekst} alert /></Groep>
      </Rij>
    </Sectie>
  );
}

// --- Filters en keuzes --------------------------------------------------------

function StatusFilterVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.StatusFilter;
  const opties = (actief: string | null) =>
    T.opties.map((optie) => ({ ...optie, actief: optie.id === actief, onKies: noop }));
  return (
    <Sectie naam="StatusFilter" titel={T.titel} uitleg={T.uitleg}>
      <Groep titel={T.zonderKeuze}><StatusFilter ariaLabel={`${T.groepNaam} (${T.zonderKeuze})`} opties={opties(null)} /></Groep>
      <Groep titel={T.metKeuze}><StatusFilter ariaLabel={`${T.groepNaam} (${T.metKeuze})`} opties={opties("actief")} /></Groep>
    </Sectie>
  );
}

function BezettingKeuzeVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.BezettingKeuze;
  const leden = T.leden.map((lid) => ({ ...lid }));
  return (
    <Sectie naam="BezettingKeuze" titel={T.titel} uitleg={T.uitleg}>
      <Dialoogvlak>
        <h3 className="text-sm font-bold">{T.kolommen.rust}</h3>
        <BezettingKeuze legend={`${T.legend} (${T.kolommen.rust})`} crew={leden} selectedId={null} onSelect={noop} />
        <h3 className="text-sm font-bold">{T.kolommen.geselecteerd}</h3>
        <BezettingKeuze legend={`${T.legend} (${T.kolommen.geselecteerd})`} crew={leden} selectedId="m2" onSelect={noop} />
        <h3 className="text-sm font-bold">{T.kolommen.uitgeschakeld}</h3>
        <BezettingKeuze legend={`${T.legend} (${T.kolommen.uitgeschakeld})`} crew={leden} selectedId="m2" onSelect={noop} disabled />
      </Dialoogvlak>
    </Sectie>
  );
}

// --- Personen en statistiek -----------------------------------------------------

const AVATAR_MATEN = ["xs", "chip", "sm", "md", "lg"] as const;

function AvatarReeks({ tone }: { tone: "dark" | "light" }) {
  const T = VOORBEELD_TEKSTEN.InitialsAvatar;
  return (
    <Rij>
      {AVATAR_MATEN.map((maat) => (
        <div key={maat} className="flex flex-col items-center gap-1 text-xs">
          <InitialsAvatar name={T.naam} size={maat} tone={tone} />
          <span>{maat}</span>
        </div>
      ))}
    </Rij>
  );
}

function InitialsAvatarVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.InitialsAvatar;
  return (
    <>
      <Sectie naam="InitialsAvatar" titel={T.titel} uitleg={T.uitleg}>
        <Dialoogvlak>
          <h3 className="text-sm font-bold">{T.lichtKop}</h3>
          <AvatarReeks tone="light" />
        </Dialoogvlak>
      </Sectie>
      <Sectie naam="InitialsAvatar" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <AvatarReeks tone="dark" />
      </Sectie>
    </>
  );
}

function MemberPillVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.MemberPill;
  return (
    <>
      <Sectie naam="MemberPill" titel={T.titel} uitleg={T.uitleg}>
        <Dialoogvlak>
          <ul aria-label={T.lijstNaam} className="flex flex-wrap gap-2">
            {T.namen.map((naam) => <MemberPill key={naam} name={naam} tone="light" />)}
          </ul>
        </Dialoogvlak>
      </Sectie>
      <Sectie naam="MemberPill" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <ul aria-label={T.lijstNaam} className="flex flex-wrap gap-2">
          {T.namen.map((naam) => <MemberPill key={naam} name={naam} tone="dark" />)}
        </ul>
      </Sectie>
    </>
  );
}

const ROLLEN = ["bardienst", "beheerder"] as const;

function RoleBadgeVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.RoleBadge;
  return (
    <>
      <Sectie naam="RoleBadge" titel={T.titel} uitleg={T.uitleg}>
        <Dialoogvlak>
          <Rij>
            {ROLLEN.map((rol) => <RoleBadge key={rol} role={rol} tone="light" />)}
          </Rij>
        </Dialoogvlak>
      </Sectie>
      <Sectie naam="RoleBadge" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <Rij>
          {ROLLEN.map((rol) => <RoleBadge key={rol} role={rol} tone="dark" />)}
        </Rij>
      </Sectie>
    </>
  );
}

function StatCardVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.StatCard;
  return (
    <Sectie naam="StatCard" titel={T.titel} uitleg={T.uitleg}>
      <Dialoogvlak>
        <StatCard variant="member" name={T.memberNaam} subtitle={T.memberOndertitel} />
        <StatCard variant="metric" label={T.metricLabel} value={T.metricWaarde} subtitle={T.metricOndertitel} />
      </Dialoogvlak>
    </Sectie>
  );
}

// --- Status en herstel ----------------------------------------------------------

function LeesFoutVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.LeesFout;
  return (
    <>
      <Sectie naam="LeesFout" titel={T.titel} uitleg={T.uitleg}>
        <Rij>
          <Groep titel={T.rust}><LeesFout tone="light" message={T.melding} onRetry={noop} /></Groep>
          <Groep titel={T.bezig}><LeesFout tone="light" message={T.melding} onRetry={noop} bezig /></Groep>
        </Rij>
      </Sectie>
      <Sectie naam="LeesFout" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <Rij>
          <Groep titel={T.rust}><LeesFout tone="rail" message={T.melding} onRetry={noop} /></Groep>
          <Groep titel={T.bezig}><LeesFout tone="rail" message={T.melding} onRetry={noop} bezig /></Groep>
        </Rij>
      </Sectie>
    </>
  );
}

/** Vast tijdstip: 8 oktober 2026, 14:32 Amsterdamse tijd. */
const BIJGEWERKT_OP = Date.UTC(2026, 9, 8, 12, 32);

function VerversStatusVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.VerversStatus;
  return (
    <Sectie naam="VerversStatus" titel={T.titel} uitleg={T.uitleg}>
      <div className="flex max-w-md flex-col gap-4">
        <Groep titel={T.rust}><VerversStatus bijgewerktOp={BIJGEWERKT_OP} bezig={false} mislukt={false} onVerversen={noop} /></Groep>
        <Groep titel={T.bezig}><VerversStatus bijgewerktOp={BIJGEWERKT_OP} bezig mislukt={false} onVerversen={noop} /></Groep>
        <Groep titel={T.mislukt}><VerversStatus bijgewerktOp={BIJGEWERKT_OP} bezig={false} mislukt message={T.mislukMelding} onVerversen={noop} /></Groep>
        <Groep titel={T.zonderTijd}><VerversStatus bijgewerktOp={null} bezig={false} mislukt message={T.mislukMelding} onVerversen={noop} /></Groep>
      </div>
    </Sectie>
  );
}

// --- Beeld en merk --------------------------------------------------------------

/** Een vaste afbeelding als data-URL: geen netwerk. */
const VOORBEELD_AFBEELDING =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="12" y="4" width="16" height="32" rx="4" fill="#ee5a24"/></svg>',
  );

const AFBEELDING_MATEN = ["tile", "row", "beheerRow", "detail"] as const;

function ProductAfbeeldingVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.ProductAfbeelding;
  return (
    <Sectie naam="ProductAfbeelding" titel={T.titel} uitleg={T.uitleg}>
      <div className="w-fit rounded-panel bg-surface p-4 text-ink">
      <Rooster
        naam={T.titel}
        kolommen={[T.metAfbeelding, T.zonderAfbeelding, T.gedempt]}
        rijen={AFBEELDING_MATEN.map((maat) => ({
          label: maat,
          cellen: [
            <div key="met" className="w-40"><ProductAfbeelding imageUrl={VOORBEELD_AFBEELDING} name={T.productNaam} size={maat} /></div>,
            <div key="zonder" className="w-40"><ProductAfbeelding imageUrl={null} name={T.productNaam} size={maat} /></div>,
            <div key="gedempt" className="w-40"><ProductAfbeelding imageUrl={VOORBEELD_AFBEELDING} name={T.productNaam} size={maat} decorative dimmed /></div>,
          ],
        }))}
      />
      </div>
    </Sectie>
  );
}

function AuroraMerkVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.AuroraMerk;
  return (
    <>
      <Sectie naam="AuroraMerk" titel={T.titel} uitleg={T.uitleg}>
        <AuroraMerk tone="light"><h3 className="text-lg font-bold">{T.kop}</h3></AuroraMerk>
      </Sectie>
      <Sectie naam="AuroraMerk" tone="rail" titel={T.rail.titel} uitleg={T.rail.uitleg}>
        <AuroraMerk tone="dark"><h3 className="text-lg font-bold">{T.kop}</h3></AuroraMerk>
      </Sectie>
    </>
  );
}

function ZoekIcoonVoorbeeld() {
  const T = VOORBEELD_TEKSTEN.ZoekIcoon;
  return (
    <Sectie naam="ZoekIcoon" titel={T.titel} uitleg={T.uitleg}>
      <Rij>
        <ZoekIcoon />
        <span className="text-xs">{T.bijschrift}</span>
      </Rij>
    </Sectie>
  );
}

/**
 * Sleutel = exact de naam van de component-export. `Voorbeelden` is alleen de
 * klantkant van het register: de server-pagina kan een register met functies
 * niet zelf doorlopen.
 */
export const VOORBEELDEN: Voorbeeldregister = {
  Knop: KnopVoorbeeld,
  Chip: ChipVoorbeeld,
  Segment: SegmentVoorbeeld,
  SegmentBalk: SegmentBalkVoorbeeld,
  TabList: TabListVoorbeeld,
  TabPanel: TabPanelVoorbeeld,
  Toets: ToetsVoorbeeld,
  PinToetsenbord: PinToetsenbordVoorbeeld,
  TekstVeld: TekstVeldVoorbeeld,
  VeldFout: VeldFoutVoorbeeld,
  ZoekVeld: ZoekVeldVoorbeeld,
  Select: SelectVoorbeeld,
  StatusFilter: StatusFilterVoorbeeld,
  BezettingKeuze: BezettingKeuzeVoorbeeld,
  InitialsAvatar: InitialsAvatarVoorbeeld,
  MemberPill: MemberPillVoorbeeld,
  RoleBadge: RoleBadgeVoorbeeld,
  StatCard: StatCardVoorbeeld,
  LeesFout: LeesFoutVoorbeeld,
  VerversStatus: VerversStatusVoorbeeld,
  ProductAfbeelding: ProductAfbeeldingVoorbeeld,
  AuroraMerk: AuroraMerkVoorbeeld,
  ZoekIcoon: ZoekIcoonVoorbeeld,
};

export function Voorbeelden() {
  return (
    <>
      {Object.entries(VOORBEELDEN).map(([naam, Voorbeeld]) => (
        <Fragment key={naam}>
          <Voorbeeld />
        </Fragment>
      ))}
    </>
  );
}
