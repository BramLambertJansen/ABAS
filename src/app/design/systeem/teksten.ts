import type systeem from "../../../../scripts/kit/systeem.lokaal.json";

/**
 * Alle teksten van /design/systeem: titels, uitleg, labels en de vaste
 * voorbeeldinhoud. De pagina en de voorbeelden bevatten zelf geen tekst.
 */

export const PAGINA = {
  metaTitel: "ABAS — ontwerpsysteem",
  titel: "Ontwerpsysteem",
  intro:
    "De tokens uit src/app/globals.css en de gedeelde bouwstenen met hun varianten en staten. Alles is voorbeeldcode met vaste gegevens: geen netwerk, geen inlog, geen Supabase.",
  tokenVoorbeeld: "Aurora bar 0123",
} as const;

export const TOKENS = {
  kleuren: { titel: "Kleuren", uitleg: "Elk --color-token uit het thema, met naam en waarde." },
  hoogtes: { titel: "Controlhoogtes", uitleg: "Elk --height-token als balk van die hoogte." },
  radii: { titel: "Radii", uitleg: "Elk --radius-token op een vierkant vlak." },
  schaduwen: { titel: "Schaduwen", uitleg: "Elk --shadow-token op een vlak." },
  tekstmaten: { titel: "Tekstmaten", uitleg: "Elk --text-token als voorbeeldtekst." },
  overig: {
    titel: "Overige tokens",
    uitleg: "Alle andere declaraties in het thema: lettertypen, ruimte, breekpunten, regelhoogtes en dergelijke.",
  },
} as const;

export const STATEN = {
  rust: "Rust",
  geselecteerd: "Geselecteerd",
  uitgeschakeld: "Uitgeschakeld",
  ariaUitgeschakeld: "aria-disabled",
  gevuld: "Gevuld",
  fout: "Fout",
  normaal: "normaal",
  groot: "groot",
  licht: "licht",
  rail: "rail",
} as const;

export const VOORBEELD_TEKSTEN = {
  Knop: {
    titel: "Knop",
    uitleg: "Props: variant, tone, maat, icoon en href. Rijen zijn variant en maat, kolommen de staat.",
    rail: { titel: "Knop op rail", uitleg: "Dezelfde matrix met tone=\"rail\" op een donkere strook." },
    varianten: { primair: "Primair", secundair: "Secundair", gevaar: "Gevaar", tekst: "Tekst" },
    kolommen: ["Rust", "disabled", "aria-disabled"],
    icoonKop: "Icoonknop (icoon, aria-label verplicht)",
    icoonNaam: "Toevoegen",
    icoonTeken: "+",
    linkKop: "Link (href)",
    linkAdres: "/design/systeem",
  },
  Chip: {
    titel: "Chip",
    uitleg: "Props: geselecteerd en maat. Zonder geselecteerd staat er geen aria-pressed.",
    staten: ["Rust", "Geselecteerd", "Uitgeschakeld", "Zonder aria-pressed"],
    label: "Contant",
  },
  Segment: {
    titel: "Segment",
    uitleg: "Een Segment staat altijd in een SegmentBalk. Props: geselecteerd en maat.",
    balkNaam: "Voorbeeld van segmenten",
    staten: { rust: "Rust", geselecteerd: "Geselecteerd", uitgeschakeld: "Uitgeschakeld" },
  },
  SegmentBalk: {
    titel: "SegmentBalk",
    uitleg: "De grijze balk met role=\"group\"; de aanroeper geeft de aria-label.",
    balkNaam: "Voorbeeld van een segmentbalk",
    opties: ["Vandaag", "Week", "Maand"],
  },
  TabList: {
    titel: "TabList",
    uitleg: "stijl=\"segment\" en stijl=\"eigen\" (vormgeving bij de aanroeper). Klik of gebruik de pijltjestoetsen.",
    segmentKop: "stijl=\"segment\"",
    eigenKop: "stijl=\"eigen\"",
    segmentNaam: "Tabs in segmentstijl",
    eigenNaam: "Tabs met eigen stijl",
    tabs: [
      { key: "een", label: "Overzicht", inhoud: "Inhoud van het eerste tabblad." },
      { key: "twee", label: "Details", inhoud: "Inhoud van het tweede tabblad." },
      { key: "drie", label: "Geschiedenis", inhoud: "Inhoud van het derde tabblad." },
    ],
  },
  TabPanel: {
    titel: "TabPanel",
    uitleg: "Het paneel bij een tab. Hier met handmatige activering: een pijl verplaatst de focus, Enter of Spatie kiest.",
    tabsNaam: "Tabs met handmatige activering",
  },
  Toets: {
    titel: "Toets",
    uitleg: "soort=\"keypad\" (licht) en soort=\"stap\". Een toets heeft geen zichtbare naam; aria-label is verplicht.",
    rail: { titel: "Toets op rail", uitleg: "soort=\"keypad\" met tone=\"rail\"." },
    kolommen: ["Rust", "Uitgeschakeld"],
    rijen: { keypadLicht: "keypad, licht", keypadRail: "keypad, rail", stap: "stap" },
    cijferNaam: "Cijfer 5",
    cijfer: "5",
    meerNaam: "Eén erbij",
    meerTeken: "+",
    minderNaam: "Eén eraf",
    minderTeken: "−",
  },
  PinToetsenbord: {
    titel: "PinToetsenbord",
    uitleg: "Vier puntjes, voortgang en een raster van toetsen. Twee cijfers ingevoerd.",
    rail: { titel: "PinToetsenbord op rail", uitleg: "tone=\"rail\", zonder en met foutmelding." },
    licht: "licht",
    railZonderFout: "rail",
    railMetFout: "rail met fout",
    foutmelding: "Onjuiste code",
    statusLabel: "Pincode",
  },
  TekstVeld: {
    titel: "TekstVeld",
    uitleg: "tone=\"light\" in rust, gevuld, met fout en uitgeschakeld.",
    rail: { titel: "TekstVeld op rail", uitleg: "tone=\"rail\": rust, gevuld en uitgeschakeld." },
    labels: { rust: "Naam", gevuld: "Naam (gevuld)", fout: "Naam (met fout)", uitgeschakeld: "Naam (uitgeschakeld)" },
    waarde: "Anna de Vries",
    foutmelding: "Vul een naam in.",
    hint: "Zoals op de ledenlijst.",
  },
  ZoekVeld: {
    titel: "ZoekVeld",
    uitleg: "Zoekveld met loep en verborgen label, leeg en gevuld.",
    labelLeeg: "Zoek een lid",
    labelGevuld: "Zoek een lid (gevuld)",
    placeholder: "Zoek op naam",
    waarde: "Anna",
  },
  Select: {
    titel: "Select",
    uitleg: "De donkere keuzelijst: leeg, met keuze, ongeldig en uitgeschakeld. Klik om te openen.",
    labels: { rust: "Activiteit", gevuld: "Activiteit (gekozen)", fout: "Activiteit (ongeldig)", uitgeschakeld: "Activiteit (uitgeschakeld)" },
    placeholder: "Kies een activiteit",
    opties: [
      { value: "repetitie", label: "Repetitie" },
      { value: "concert", label: "Concert" },
      { value: "clubavond", label: "Clubavond" },
    ],
    gekozen: "concert",
  },
  StatusFilter: {
    titel: "StatusFilter",
    uitleg: "Chips met tellers, zonder en met een gekozen optie.",
    groepNaam: "Status",
    zonderKeuze: "Rust",
    metKeuze: "Geselecteerd",
    opties: [
      { id: "actief", label: "Actief", aantal: 24 },
      { id: "uitgenodigd", label: "Uitgenodigd", aantal: 3 },
      { id: "gearchiveerd", label: "Gearchiveerd", aantal: 8 },
    ],
  },
  BezettingKeuze: {
    titel: "BezettingKeuze",
    uitleg: "Eén persoon kiezen uit de bezetting: zonder keuze, met keuze en uitgeschakeld.",
    legend: "Wie geeft uit?",
    kolommen: { rust: "Rust", geselecteerd: "Geselecteerd", uitgeschakeld: "Uitgeschakeld" },
    leden: [
      { id: "m1", name: "Anna de Vries" },
      { id: "m2", name: "Bas Jansen" },
      { id: "m3", name: "Carla Smit" },
    ],
  },
  InitialsAvatar: {
    titel: "InitialsAvatar",
    uitleg: "Vijf maten, in de donkere en lichte tone.",
    rail: { titel: "InitialsAvatar op rail", uitleg: "tone=\"dark\" in alle maten." },
    naam: "Anna de Vries",
    lichtKop: "tone=\"light\"",
  },
  MemberPill: {
    titel: "MemberPill",
    uitleg: "Avatar met naam in een lijst, in de lichte tone.",
    lijstNaam: "Bezetting",
    rail: { titel: "MemberPill op rail", uitleg: "tone=\"dark\"." },
    namen: ["Anna de Vries", "Bas Jansen"],
  },
  RoleBadge: {
    titel: "RoleBadge",
    uitleg: "Beide rollen in de lichte tone.",
    rail: { titel: "RoleBadge op rail", uitleg: "Beide rollen in de donkere tone." },
  },
  StatCard: {
    titel: "StatCard",
    uitleg: "variant=\"member\" en variant=\"metric\".",
    memberNaam: "Anna de Vries",
    memberOndertitel: "saldo €12,50",
    metricLabel: "Omzet",
    metricWaarde: "€148,50",
    metricOndertitel: "37 bestellingen",
  },
  LeesFout: {
    titel: "LeesFout",
    uitleg: "Een leesfout met herstelactie, in rust en tijdens het opnieuw proberen (aria-disabled).",
    rail: { titel: "LeesFout op rail", uitleg: "tone=\"rail\" in dezelfde staten." },
    melding: "De gegevens konden niet worden opgehaald.",
    rust: "Rust",
    bezig: "Bezig",
  },
  VerversStatus: {
    titel: "VerversStatus",
    uitleg: "Bijgewerkt-regel met verversknop: rust, bezig, mislukt en zonder tijdstip.",
    rust: "Rust",
    bezig: "Bezig",
    mislukt: "Mislukt",
    zonderTijd: "Zonder tijdstip",
    mislukMelding: "Geen verbinding.",
  },
  ProductAfbeelding: {
    titel: "ProductAfbeelding",
    uitleg: "Vier maten, met afbeelding en met initialen (geen afbeelding), plus gedempt.",
    metAfbeelding: "Met afbeelding",
    zonderAfbeelding: "Initialen",
    gedempt: "Gedempt",
    productNaam: "Cola",
  },
  AuroraMerk: {
    titel: "AuroraMerk",
    uitleg: "Het merkteken in de lichte tone, met een kop als kind.",
    rail: { titel: "AuroraMerk op rail", uitleg: "tone=\"dark\"." },
    kop: "Inloggen",
  },
  ZoekIcoon: {
    titel: "ZoekIcoon",
    uitleg: "Het decoratieve zoekicoon.",
    bijschrift: "Decoratief, aria-hidden",
  },
  VeldFout: {
    titel: "VeldFout",
    uitleg: "De veldmelding onder een invoerveld: stil en als alert.",
    stil: "Zonder role",
    alert: "Met role=\"alert\"",
    tekst: "Vul een naam in.",
  },
  OpslaanSectie: {
    titel: "OpslaanSectie",
    uitleg:
      "Eén actiesectie in een beheerdialoog: statusregel, bezig (aria-busy), wachten op een andere sectie en de eigen foutregel. Per staat één voorbeeld.",
    staten: {
      zonderStatus: "Zonder statusregel",
      statusLeeg: "status={null}: regel gereserveerd, leeg",
      onopgeslagen: "status=\"onopgeslagen\"",
      opgeslagen: "status=\"opgeslagen\"",
      statusTekst: "status=\"opgeslagen\" met statusTekst",
      pending: "pending",
      wachtOpAnder: "wachtOpAnder",
      fout: "fout",
      zonderChrome: "chrome={false}",
      labelEnKop: "Met label (groep) en kop",
    },
    knop: "Opslaan",
    statusTekst: "Prijs opgeslagen",
    foutmelding: "Opslaan is niet gelukt. Probeer het opnieuw.",
    archiveren: "Archiveren",
    groepNaam: "Prijs",
    kopTitel: "Prijs",
    kopUitleg: "Geldt voor nieuwe bestellingen; eerdere bestellingen houden hun prijs.",
  },
  NieuwWachtwoordVelden: {
    titel: "NieuwWachtwoordVelden",
    uitleg:
      "Nieuw wachtwoord en herhalen, met de live checklist van de regels. Steeds in het witte dialoogvlak.",
    staten: {
      leeg: "Leeg",
      deels: "Deels voldaan",
      voldaan: "Alle regels voldaan en gelijk",
      mismatch: "Niet gelijk",
      readOnly: "readOnly (tijdens opslaan)",
    },
    deels: "aurora",
    voldaan: "Aurora!2026",
    anders: "Aurora!2025",
  },
  LidZoeker: {
    titel: "LidZoeker",
    uitleg:
      "Kies een lid: zoekveld met resultatenlijst en saldo. Leeg, leden laden, leesfout en zonder treffer.",
    staten: {
      leeg: "Leeg",
      laden: "Leden laden (status=\"loading\")",
      fout: "Leesfout (status=\"error\")",
      geenTreffer: "Zonder treffer",
    },
    zoektermLaden: "Anna",
    zoektermGeen: "Daan",
    foutmelding: "De leden konden niet worden opgehaald.",
    leden: [
      { id: "m1", name: "Anna de Vries", balanceCents: 1250 },
      { id: "m2", name: "Bas Jansen", balanceCents: 3400 },
      { id: "m3", name: "Carla Smit", balanceCents: 450 },
    ],
    laagSaldoCents: 1000,
    zoeken: {
      titel: "LidZoeker: zoeken",
      uitleg: "Eén lege zoeker om in te typen. Onder het veld is ruimte voor de open lijst.",
      kop: "Rust",
    },
  },
  CodeInvoer: {
    titel: "CodeInvoer",
    uitleg: "De 6-cijferige code uit de authenticator-app, licht: direct versturen en met een bevestigknop.",
    rail: { titel: "CodeInvoer op rail", uitleg: "tone=\"rail\", leeg." },
    staten: {
      leeg: "Leeg",
      metKnop: "Met submitLabel (knop aria-disabled)",
      rail: "Leeg, rail",
    },
    fout: {
      titel: "CodeInvoer: onjuiste code",
      uitleg: "De controle geeft altijd \"onjuiste code\". Voer zes cijfers in om de foutmelding te zien.",
      kop: "Rust",
    },
    bezig: {
      titel: "CodeInvoer: bezig",
      uitleg: "De controle rondt nooit af. Voer zes cijfers in om de bezig-staat te zien.",
      kop: "Rust",
    },
    bevestigen: {
      titel: "CodeInvoer: bevestigen",
      uitleg: "Met submitLabel; de controle geeft altijd \"onjuiste code\". Zes cijfers, dan Bevestigen.",
      kop: "Rust",
    },
  },
} as const;

export const NIET_OP_DEZE_PAGINA = {
  titel: "Niet op deze pagina",
  uitleg:
    "Deze componenten staan hier niet. Uitzonderingen hebben een code en zijn bewust niet getoond; de componenten met een los venster staan elk in een eigen document.",
  caption: "Niet op deze pagina",
  kolommen: { component: "Component", code: "Code", toelichting: "Toelichting" },
  vensterKop: "Losse vensters",
  geenUitzonderingen: "Er zijn geen uitzonderingen: elke component staat hier of in een los venster.",
} as const;

/** Een venster-id uit systeem.lokaal.json → vensters. */
export type VensterId = keyof typeof systeem.vensters;

/** Voorbeeldinhoud van de beide detailvensters: genoeg secties om te scrollen. */
const DETAIL = {
  titel: "Lid beheren",
  beschrijving: "Wijzigingen aan Anna de Vries.",
  rol: "beheerder",
  saldoCents: 1250,
  saldoLabel: "Saldo",
  secties: [
    { kop: "Profiel", tekst: "Naam en e-mailadres van het lid. Een nieuw e-mailadres krijgt eerst een bevestiging." },
    { kop: "Rol", tekst: "Lid, bardienst of beheerder. Een beheerder heeft ook een tweede factor nodig." },
    { kop: "Toegang", tekst: "Of het lid kan inloggen, en of er een uitnodiging openstaat." },
    { kop: "Pincode", tekst: "Een optionele snelkoppeling voor de bar. Het wachtwoord blijft verplicht." },
    { kop: "Bestellingen", tekst: "De laatste bestellingen en opwaarderingen van het lid, nieuwste eerst." },
    { kop: "Archief", tekst: "Een gearchiveerd lid staat niet meer op de namenlijst; de historie blijft bewaard." },
  ],
} as const;

/** Het formulier van de modal-, bezig- en onopgeslagen-vensters. */
const PRIJS = {
  titel: "Prijs wijzigen",
  beschrijving: "Geldt voor nieuwe bestellingen; eerdere bestellingen houden hun prijs.",
  veldLabel: "Nieuwe prijs",
  waarde: "2,50",
  annuleren: "Annuleren",
  opslaan: "Opslaan",
} as const;

/** Inhoud van de beide ZijPaneel-vensters. */
const ZIJ_PANEEL = {
  inhoudKop: "Inhoud",
  inhoudTekst: "Het inhoudsvlak. Vanaf 700px staat het zijpaneel ernaast, smaller staat het eronder.",
  paneelKop: "Mandje",
  paneelTekst: "Het zijpaneel scrollt binnen zichzelf.",
} as const;

/**
 * De teksten van de losse vensters (/design/systeem/venster/<id>): de
 * vensternaam (voor de h1 en de <title>) en de voorbeeldinhoud. Getypt op de
 * ids uit systeem.lokaal.json: een ontbrekend of extra venster faalt in typecheck.
 */
export const VENSTER_TEKSTEN = {
  "overlay-modal": { naam: "Overlay als modal", ...PRIJS },
  "overlay-modal-detail": { naam: "Overlay als modal, variant detail", ...DETAIL },
  "overlay-sheet": {
    naam: "Overlay als sheet",
    titel: "Naam wijzigen",
    beschrijving: "Zo zien de bardienst en de beheerder je naam.",
    veldLabel: "Naam",
    waarde: "Anna de Vries",
    annuleren: "Annuleren",
    opslaan: "Opslaan",
  },
  "overlay-sheet-detail": { naam: "Overlay als sheet, variant detail", ...DETAIL },
  "overlay-bezig": { naam: "Overlay tijdens een actie (closeBlocked)", ...PRIJS },
  "overlay-onopgeslagen": { naam: "Overlay met niet-opgeslagen invoer (onopgeslagen)", ...PRIJS },
  "overlay-sluit-knop": {
    naam: "OverlaySluitKnop in drie vormen",
    titel: "Sluitknoppen",
    beschrijving: "Elke vorm vraagt de Overlay om te sluiten, met dezelfde regels als Escape.",
    knop: "Sluiten",
    vormen: {
      secundair: "variant=\"secundair\" (standaard)",
      tekst: "variant=\"tekst\"",
      groot: "maat=\"groot\"",
    },
  },
  "overlay-presence-provider": {
    naam: "OverlayPresenceProvider met een open overlay",
    titel: "Overlay-aanwezigheid",
    beschrijving: "Deze overlay meldt zich aan bij de provider eromheen; de teller leest useOpenOverlayCount().",
    teller: "Open overlays onder deze provider:",
  },
  "start-scherm": {
    naam: "StartScherm",
    titel: "Dienst starten",
  },
  "zij-paneel": { naam: "ZijPaneel vanaf 700px", ...ZIJ_PANEEL },
  "zij-paneel-smal": { naam: "ZijPaneel onder 700px", ...ZIJ_PANEEL },
} as const satisfies Record<VensterId, { naam: string; [veld: string]: unknown }>;
