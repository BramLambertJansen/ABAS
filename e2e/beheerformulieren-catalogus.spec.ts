import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  USER,
  alertOf,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";

/**
 * #131 (T11): beheerformulieren en catalogus duidelijker
 * (docs/features/beheerformulieren-catalogus.md). Zonder echte database:
 * Supabase via `page.route()`, zelfde aanpak als e2e/opslaan-sluiten-pending.spec.ts.
 * Wat dit niet toetst: een echt schermtoetsenbord op een tablet, schermlezer,
 * en een echt bezorgde uitnodigingsmail (handmatig, zie de spec).
 */

type Lid = {
  id: string;
  name: string;
  role: string;
  balance_cents: number;
  archived: boolean;
  auth_user_id: string | null;
  has_pin: boolean;
  email: string | null;
  invited_at: string | null;
};

const LID: Lid = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Joris de Vries",
  role: "bardienst",
  balance_cents: 1250,
  archived: false,
  auth_user_id: null,
  has_pin: false,
  email: "joris@aurora.local",
  invited_at: null,
};

type Product = { id: string; name: string; category: string; price_cents: number; archived: boolean };

const PRODUCTEN: Product[] = [
  { id: "p1", name: "Pils", category: "Bier", price_cents: 250, archived: false },
  { id: "p2", name: "Witbier", category: "Bier", price_cents: 300, archived: true },
  { id: "p3", name: "Cola", category: "Fris", price_cents: 200, archived: false },
  { id: "p4", name: "Chips", category: "Snacks", price_cents: 150, archived: false },
];

type Type = { id: string; name: string; archived: boolean };

type Opties = {
  lid?: Lid;
  producten?: Product[];
  types?: Type[];
};

type Mock = {
  calls: { archiveType: Array<Record<string, unknown>>; archiveProduct: number; email: Array<Record<string, unknown>> };
  lid: Lid;
  producten: Product[];
  types: Type[];
};

async function mockBeheerder(page: Page, opties: Opties = {}): Promise<Mock> {
  const mock: Mock = {
    calls: { archiveType: [], archiveProduct: 0, email: [] },
    lid: { ...(opties.lid ?? LID) },
    producten: (opties.producten ?? PRODUCTEN).map((p) => ({ ...p })),
    types: (opties.types ?? [
      { id: "t1", name: "Training", archived: false },
      { id: "t2", name: "Concert", archived: false },
    ]).map((t) => ({ ...t })),
  };

  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const isBeheerder = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = isBeheerder ? { name: "Femke Bos", role: "beheerder", has_pin: false } : null;
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  });
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) => json(route, 200, mock.producten));
  await page.route(/\/rest\/v1\/activity_types(\?|$)/, (route) =>
    json(
      route,
      200,
      [...mock.types].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
    )
  );
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [mock.lid]));
  await page.route(/\/rest\/v1\/rpc\/set_activity_type_archived(\?|$)/, (route) => {
    const body = route.request().postDataJSON() as { p_activity_type_id: string; p_archived: boolean };
    mock.calls.archiveType.push(body);
    const type = mock.types.find((t) => t.id === body.p_activity_type_id)!;
    type.archived = body.p_archived;
    return json(route, 200, type);
  });
  await page.route(/\/rest\/v1\/rpc\/set_product_archived(\?|$)/, (route) => {
    mock.calls.archiveProduct++;
    const body = route.request().postDataJSON() as { p_product_id: string; p_archived: boolean };
    const product = mock.producten.find((p) => p.id === body.p_product_id)!;
    product.archived = body.p_archived;
    return json(route, 200, product);
  });
  await mockBarSessie(page);
  return mock;
}

async function naarBeheer(page: Page, tab: "Assortiment" | "Leden" | "Instellingen") {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: tab }).click();
}

async function openLid(page: Page) {
  await naarBeheer(page, "Leden");
  await page.getByRole("button", { name: LID.name }).click();
  const dialog = page.getByRole("dialog", { name: "Lid beheren" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function axe(page: Page) {
  const resultaat = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(resultaat.violations, JSON.stringify(resultaat.violations, null, 2)).toEqual([]);
}

/** Bevat elk bereikbaar element na elke Tab de dialoog? */
async function tabBlijftInDialoog(page: Page, richting: "Tab" | "Shift+Tab", stappen: number) {
  for (let i = 0; i < stappen; i++) {
    await page.keyboard.press(richting);
    const binnen = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(binnen).toBe(true);
  }
}

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`Lid beheren ${viewport.width}x${viewport.height}: titel, saldo en Sluiten blijven zichtbaar bij scrollen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockBeheerder(page);
    const dialog = await openLid(page);

    const titel = dialog.getByRole("heading", { name: "Lid beheren", level: 2 });
    const sluiten = dialog.getByRole("button", { name: "Sluiten" });
    await expect(sluiten).toHaveCount(1);
    await expect(dialog.getByText("Saldo € 12,50")).toBeVisible();
    // Vier groepen met een h3.
    for (const kop of ["Profiel", "Toegang", "Bestellingen", "Archief"]) {
      await expect(dialog.getByRole("heading", { name: kop, level: 3 })).toBeVisible();
    }

    const archiveer = dialog.getByRole("button", { name: /Lid archiveren/ });
    await archiveer.scrollIntoViewIfNeeded();
    await expect(archiveer).toBeInViewport();
    await expect(titel).toBeInViewport();
    await expect(sluiten).toBeInViewport();
    await expect(dialog.getByText("Saldo € 12,50")).toBeInViewport();

    // Tab/Shift+Tab verlaat de dialoog nooit; de achtergrond is inert.
    await tabBlijftInDialoog(page, "Tab", 30);
    await tabBlijftInDialoog(page, "Shift+Tab", 30);
    const inert = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"]')!;
      let node: Element | null = el;
      let totaal = 0;
      let inertAantal = 0;
      while (node && node !== document.body) {
        const parent: Element | null = node.parentElement;
        if (!parent) break;
        for (const sib of Array.from(parent.children)) {
          if (sib === node || ["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NEXT-ROUTE-ANNOUNCER"].includes(sib.tagName)) continue;
          totaal++;
          if (sib.hasAttribute("inert")) inertAantal++;
        }
        node = parent;
      }
      return { totaal, inertAantal };
    });
    expect(inert.totaal).toBeGreaterThan(0);
    expect(inert.inertAantal).toBe(inert.totaal);

    // Onopgeslagen invoer: Escape vraagt, de vraag staat buiten het scrollgebied zichtbaar.
    await dialog.getByLabel("Naam", { exact: true }).fill("Joris de Jong");
    await archiveer.scrollIntoViewIfNeeded();
    await page.keyboard.press("Escape");
    const vraag = dialog.getByText("Niet-opgeslagen wijziging weggooien?");
    await expect(vraag).toBeInViewport();
    await expect(sluiten).toBeInViewport();
    await dialog.getByRole("button", { name: "Terug", exact: true }).click();
    await expect(dialog).toBeVisible();

    await axe(page);

    // Ook de vaste Sluiten-knop vraagt vóór het weggooien.
    await sluiten.click();
    await expect(vraag).toBeInViewport();
    await dialog.getByRole("button", { name: "Weggooien", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("Sectiestatus: Niet opgeslagen alleen bij de gewijzigde sectie, Opgeslagen na opslaan, geen toast", async ({ page }) => {
  await mockBeheerder(page);
  await page.route(/\/rest\/v1\/rpc\/update_member_name(\?|$)/, (route) =>
    json(route, 200, { ...LID, name: "Joris de Jong" })
  );
  const dialog = await openLid(page);
  const naam = dialog.getByRole("group", { name: "Naam wijzigen" });
  const contact = dialog.getByRole("group", { name: "Contactadres wijzigen" });

  await expect(naam.getByText("Niet opgeslagen")).toHaveCount(0);
  await dialog.getByLabel("Naam", { exact: true }).fill("Joris de Jong");
  await expect(naam.getByRole("status")).toHaveText("Niet opgeslagen");
  await expect(contact.getByRole("status")).toHaveText("");
  await expect(dialog.getByText("Niet opgeslagen")).toHaveCount(1);

  await naam.getByRole("button", { name: "Opslaan" }).click();
  await expect(naam.getByRole("status")).toHaveText("Opgeslagen");
  await expect(dialog.getByText("Niet opgeslagen")).toHaveCount(0);
  // Geen losse toast meer.
  await expect(page.getByText("Naam bijgewerkt")).toHaveCount(0);

  // Typen wist "Opgeslagen".
  await dialog.getByLabel("Naam", { exact: true }).fill("Joris de Jong2");
  await expect(naam.getByRole("status")).toHaveText("Niet opgeslagen");
  await dialog.getByLabel("Naam", { exact: true }).fill("Joris de Jong");
  await expect(naam.getByRole("status")).toHaveText("");
});

test("Sectiestatus: een mislukte opslag toont de fout en geen Opgeslagen", async ({ page }) => {
  await mockBeheerder(page);
  await page.route(/\/rest\/v1\/rpc\/update_member_name(\?|$)/, (route) =>
    json(route, 400, { message: "invalid_name" })
  );
  const dialog = await openLid(page);
  const naam = dialog.getByRole("group", { name: "Naam wijzigen" });

  await dialog.getByLabel("Naam", { exact: true }).fill("Jori");
  await naam.getByRole("button", { name: "Opslaan" }).click();
  await expect(alertOf(page)).toHaveText("vul een naam in");
  await expect(naam.getByRole("status")).toHaveText("");
  await expect(dialog.getByText("Opgeslagen")).toHaveCount(0);
});

test("Contactadres: uitleg altijd, accountuitleg bij gekoppeld lid, opgeslagen-tekst zonder claim over het inlogadres", async ({ page }) => {
  await mockBeheerder(page, {
    lid: { ...LID, auth_user_id: "00000000-0000-4000-8000-0000000000bb", email: "joris@aurora.local" },
  });
  await page.route(/\/rest\/v1\/rpc\/update_member_email(\?|$)/, (route) =>
    json(route, 200, { ...LID, auth_user_id: "00000000-0000-4000-8000-0000000000bb", email: "ander@aurora.local" })
  );
  const dialog = await openLid(page);
  const contact = dialog.getByRole("group", { name: "Contactadres wijzigen" });

  await expect(dialog.getByLabel("Contactadres", { exact: true })).toBeVisible();
  await expect(dialog.getByText("E-mailadres", { exact: true })).toHaveCount(0);
  await expect(contact).toContainText("Hierheen stuurt ABAS de uitnodiging. Dit is niet automatisch het adres waarmee het lid inlogt.");
  await expect(contact).toContainText("Dit lid heeft al een account. Een ander adres hier verandert het inlogadres niet");

  await dialog.getByLabel("Contactadres", { exact: true }).fill("ander@aurora.local");
  await contact.getByRole("button", { name: "Opslaan" }).click();
  await expect(contact.getByRole("status")).toHaveText("Contactadres opgeslagen. Het inlogadres is niet gewijzigd.");
  await expect(dialog.getByText(/inlogadres is gewijzigd/i)).toHaveCount(0);
  await axe(page);
});

test("Contactadres: lid zonder account en zonder adres krijgt geen account- of uitnodigingsuitleg", async ({ page }) => {
  await mockBeheerder(page, { lid: { ...LID, email: null } });
  const dialog = await openLid(page);
  const contact = dialog.getByRole("group", { name: "Contactadres wijzigen" });
  await expect(contact).toContainText("Zonder contactadres kan er geen uitnodiging worden gestuurd.");
  await expect(contact).not.toContainText("Dit lid heeft al een account");
  await expect(contact).not.toContainText("openstaande uitnodiging");
});

test("Contactadres: ander adres wist de openstaande uitnodiging, de status volgt de RPC (regressie invitedAt)", async ({ page }) => {
  await mockBeheerder(page, { lid: { ...LID, invited_at: "2026-09-20T10:00:00Z" } });
  await page.route(/\/rest\/v1\/rpc\/update_member_email(\?|$)/, (route) =>
    json(route, 200, { ...LID, email: "nieuw@aurora.local", invited_at: null })
  );
  const dialog = await openLid(page);
  const contact = dialog.getByRole("group", { name: "Contactadres wijzigen" });

  await expect(dialog.getByText(/uitgenodigd op .*nog geen account/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Uitnodiging opnieuw versturen" })).toBeVisible();
  await expect(contact).toContainText("Een ander adres laat de openstaande uitnodiging vervallen");

  await dialog.getByLabel("Contactadres", { exact: true }).fill("nieuw@aurora.local");
  await contact.getByRole("button", { name: "Opslaan" }).click();
  await expect(contact.getByRole("status")).toHaveText("Contactadres opgeslagen.");

  await expect(dialog.getByText("nog niet uitgenodigd")).toBeVisible();
  await expect(dialog.getByText(/uitgenodigd op/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Uitnodiging versturen" })).toBeVisible();
  await expect(contact).not.toContainText("openstaande uitnodiging");
});

test("Contactadres: na een verstuurde uitnodiging wist een ander adres 'Uitnodiging verstuurd'", async ({ page }) => {
  await mockBeheerder(page);
  await page.route(/\/beheer\/invite(\?|$)/, (route) =>
    route.request().method() === "POST"
      ? json(route, 200, { ok: true, invited: true, invitedAt: "2026-09-20T10:00:00Z" })
      : route.fallback()
  );
  await page.route(/\/rest\/v1\/rpc\/update_member_email(\?|$)/, (route) =>
    json(route, 200, { ...LID, email: "nieuw@aurora.local", invited_at: null })
  );
  const dialog = await openLid(page);
  const contact = dialog.getByRole("group", { name: "Contactadres wijzigen" });

  await dialog.getByRole("button", { name: "Uitnodiging versturen" }).click();
  await expect(dialog.getByText("Uitnodiging verstuurd")).toBeVisible();

  await dialog.getByLabel("Contactadres", { exact: true }).fill("nieuw@aurora.local");
  await contact.getByRole("button", { name: "Opslaan" }).click();
  await expect(contact.getByRole("status")).toHaveText("Contactadres opgeslagen.");
  await expect(dialog.getByText("nog niet uitgenodigd")).toBeVisible();
  await expect(dialog.getByText("Uitnodiging verstuurd")).toHaveCount(0);
});

test("Archief in Lid beheren: status Gearchiveerd/Teruggezet in de eigen sectie en de herstelroute", async ({ page }) => {
  const mock = await mockBeheerder(page);
  await page.route(/\/rest\/v1\/rpc\/set_member_archived(\?|$)/, (route) => {
    const body = route.request().postDataJSON() as { p_archived: boolean };
    mock.lid.archived = body.p_archived;
    return json(route, 200, mock.lid);
  });
  const dialog = await openLid(page);
  const archief = dialog.getByRole("group", { name: "Archiveren" });
  await expect(archief).toContainText("Terugzetten kan onder ‘Archief’ in de ledenlijst.");
  await dialog.getByRole("button", { name: /Lid archiveren/ }).click();
  await expect(archief.getByRole("status")).toHaveText("Gearchiveerd");
  await expect(dialog.getByText("GEARCHIVEERD", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /Lid terugzetten/ }).click();
  await expect(archief.getByRole("status")).toHaveText("Teruggezet");
});

function productRijen(page: Page) {
  return page.getByRole("list").getByRole("listitem");
}

test("Producten: standaard Actief, chips met tellers, zoeken op naam en categorie", async ({ page }) => {
  await mockBeheerder(page);
  await naarBeheer(page, "Assortiment");
  const actief = page.getByRole("button", { name: /^Actief/ });
  const uit = page.getByRole("button", { name: /^Uit assortiment/ });

  await expect(actief).toHaveAttribute("aria-pressed", "true");
  await expect(actief).toContainText("3");
  await expect(uit).toContainText("1");
  await expect(page.getByText("3 van 4 producten")).toBeVisible();
  await expect(page.getByRole("button", { name: /Witbier/ })).toHaveCount(0);

  const zoek = page.getByLabel("Zoek product op naam of categorie");
  await zoek.fill("  PILS ");
  await expect(page.getByText("1 van 4 producten")).toBeVisible();
  await expect(page.getByRole("button", { name: /Pils/ })).toBeVisible();

  // Categorie; de teller van Uit assortiment volgt de zoekterm en maakt een
  // gearchiveerd treffer zichtbaar.
  await zoek.fill("bier");
  await expect(actief).toContainText("1");
  await expect(uit).toContainText("1");
  await uit.click();
  await expect(uit).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Witbier/ })).toBeVisible();
  await expect(page.getByText("Uit assortiment", { exact: true }).first()).toBeVisible();
  await axe(page);
});

test("Producten: de drie lege uitkomsten en Zoekopdracht wissen", async ({ page }) => {
  await mockBeheerder(page, { producten: PRODUCTEN.filter((p) => !p.archived) });
  await naarBeheer(page, "Assortiment");

  const zoek = page.getByLabel("Zoek product op naam of categorie");
  await zoek.fill("zzz");
  await expect(page.getByText("Geen producten gevonden voor “zzz”.")).toBeVisible();
  await page.getByRole("button", { name: "Zoekopdracht wissen" }).click();
  await expect(zoek).toHaveValue("");
  await expect(page.getByRole("button", { name: /Pils/ })).toBeVisible();

  await page.getByRole("button", { name: /^Uit assortiment/ }).click();
  await expect(page.getByText("Geen producten uit assortiment.")).toBeVisible();
});

test("Producten: zoekterm die alleen in de andere status matcht meldt geen 'geen treffers'", async ({ page }) => {
  await mockBeheerder(page);
  await naarBeheer(page, "Assortiment");
  await page.getByLabel("Zoek product op naam of categorie").fill("Witbier");
  await expect(page.getByRole("button", { name: /^Uit assortiment/ })).toContainText("1");
  await expect(page.getByText(/Geen producten gevonden voor/)).toHaveCount(0);
  await expect(page.getByText("Geen actieve producten. Bekijk Uit assortiment.")).toBeVisible();
});

test("Producten: geen actieve producten verwijst naar Uit assortiment", async ({ page }) => {
  await mockBeheerder(page, { producten: PRODUCTEN.filter((p) => p.archived) });
  await naarBeheer(page, "Assortiment");
  await expect(page.getByText("Geen actieve producten. Bekijk Uit assortiment.")).toBeVisible();
});

test("Producten: nog geen producten", async ({ page }) => {
  await mockBeheerder(page, { producten: [] });
  await naarBeheer(page, "Assortiment");
  await expect(page.getByText("Nog geen producten — voeg het eerste toe.")).toBeVisible();
});

test("Producten: archiveren in de overlay laat het product na sluiten uit Actief verdwijnen en in Uit assortiment verschijnen", async ({ page }) => {
  await mockBeheerder(page);
  await naarBeheer(page, "Assortiment");
  await page.getByRole("button", { name: /Pils/ }).click();
  const dialog = page.getByRole("dialog", { name: "Product beheren" });
  await expect(dialog).toContainText(
    "Het product verdwijnt van het verkoopscherm. Verkoophistorie blijft bestaan. Terugzetten kan onder ‘Uit assortiment’."
  );
  await dialog.getByRole("button", { name: /Uit assortiment halen/ }).click();
  // De overlay houdt zijn momentopname en blijft staan.
  await expect(dialog.getByRole("button", { name: /Terug in assortiment/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Sluiten" }).click();
  await expect(page.getByRole("button", { name: /Pils/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Uit assortiment/ }).click();
  await expect(page.getByRole("button", { name: /Pils/ })).toBeVisible();
});

test("Producten: 120 producten blijven bruikbaar", async ({ page }) => {
  const veel: Product[] = Array.from({ length: 120 }, (_, i) => ({
    id: `x${i}`,
    name: `Product ${String(i).padStart(3, "0")}`,
    category: i % 2 === 0 ? "Bier" : "Fris",
    price_cents: 100 + i,
    archived: i % 10 === 0,
  }));
  await mockBeheerder(page, { producten: veel });
  await naarBeheer(page, "Assortiment");
  await expect(page.getByText("108 van 120 producten")).toBeVisible();
  await page.getByLabel("Zoek product op naam of categorie").fill("product 05");
  await expect(page.getByText("9 van 120 producten")).toBeVisible();
  await expect(productRijen(page).first()).toBeVisible();
});

test("Activiteitstypes: laatste actieve archiveren toont eerst de waarschuwing, geen RPC tot Toch archiveren", async ({ page }) => {
  const mock = await mockBeheerder(page, {
    types: [
      { id: "t1", name: "Training", archived: false },
      { id: "t2", name: "Concert", archived: true },
    ],
  });
  await naarBeheer(page, "Instellingen");
  const archiveer = page.getByRole("button", { name: "Training archiveren" });
  await archiveer.click();

  const blok = page.getByRole("group", { name: /Dit is het laatste actieve activiteitstype/ });
  await expect(blok).toContainText("Zonder actief type kan niemand een dienst starten.");
  await expect(blok.getByRole("button", { name: "Annuleren" })).toBeFocused();
  expect(mock.calls.archiveType).toHaveLength(0);
  await axe(page);

  // Annuleren: geen aanroep, focus terug op de archiveerknop van de rij.
  await blok.getByRole("button", { name: "Annuleren" }).click();
  await expect(blok).toHaveCount(0);
  await expect(archiveer).toBeFocused();
  expect(mock.calls.archiveType).toHaveLength(0);

  // Eerst een type toevoegen: focus op het invoerveld, niets gearchiveerd.
  await archiveer.click();
  await blok.getByRole("button", { name: "Eerst een type toevoegen" }).click();
  await expect(blok).toHaveCount(0);
  await expect(page.getByLabel("Nieuw activiteitstype")).toBeFocused();
  expect(mock.calls.archiveType).toHaveLength(0);

  // Toch archiveren: nu pas de RPC, daarna de vaste melding.
  await archiveer.click();
  await blok.getByRole("button", { name: "Toch archiveren" }).click();
  await expect.poll(() => mock.calls.archiveType.length).toBe(1);
  expect(mock.calls.archiveType[0]).toEqual({ p_activity_type_id: "t1", p_archived: true });
  const melding = page.getByRole("status").filter({ hasText: "Er is geen actief activiteitstype." });
  await expect(melding).toContainText("Er kan geen dienst worden gestart. Herstel een type hieronder of voeg een nieuw type toe.");
  await axe(page);

  // Herstellen haalt de melding weg.
  await page.getByRole("button", { name: "Training herstellen" }).click();
  await expect(melding).toHaveCount(0);
});

test("Activiteitstypes: bij twee actieve types archiveert één klik direct, zonder bevestiging", async ({ page }) => {
  const mock = await mockBeheerder(page);
  await naarBeheer(page, "Instellingen");
  await page.getByRole("button", { name: "Training archiveren" }).click();
  await expect.poll(() => mock.calls.archiveType.length).toBe(1);
  await expect(page.getByRole("group", { name: /laatste actieve/ })).toHaveCount(0);
  await expect(page.getByText("Er is geen actief activiteitstype.")).toHaveCount(0);
});

test("Activiteitstypes: de vaste melding staat er als er al geen actief type is, niet bij een lege lijst", async ({ page }) => {
  await mockBeheerder(page, { types: [{ id: "t1", name: "Training", archived: true }] });
  await naarBeheer(page, "Instellingen");
  await expect(page.getByText("Er is geen actief activiteitstype.")).toBeVisible();
});

test("Activiteitstypes: lege lijst toont alleen de bestaande lege-tekst", async ({ page }) => {
  await mockBeheerder(page, { types: [] });
  await naarBeheer(page, "Instellingen");
  await expect(page.getByText("Nog geen activiteittypes — voeg het eerste toe.")).toBeVisible();
  await expect(page.getByText("Er is geen actief activiteitstype.")).toHaveCount(0);
});
