// kit: generiek
import { test, expect, type Page } from "@playwright/test";
import { scanAxe, WCAG_TAGS } from "./helpers/scanAxe";

/**
 * Meta-test voor de helper scanAxe (docs/features/scan-axe.md → Tests):
 * bewijst met `page.setContent`, zonder app-route, dat de vaste tagset
 * WCAG 2.0, 2.1 en 2.2 AA scant, dat best-practice alleen uitbreidt, dat
 * `binnen` de scope beperkt, dat uitzonderingen een reden eisen en een
 * annotatie zetten, en dat de melding per regel afkapt op 5 elementen.
 */

async function document(page: Page, body: string, head = "") {
  await page.setContent(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>scanAxe meta-test</title>${head}</head><body>${body}</body></html>`,
  );
}

// Een 1x1-png als data-URL, zodat er geen netwerk nodig is.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const IMG_ZONDER_ALT = `<main><h1>Kop</h1><img src="${PNG}" width="20" height="20"></main>`;

test("de tagset is WCAG 2.2 AA: alle vijf de tags", () => {
  expect([...WCAG_TAGS]).toEqual(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
});

test("1. een schoon document slaagt", async ({ page }) => {
  await document(page, "<main><h1>Kop</h1><p>Tekst.</p></main>");
  await scanAxe(page);
});

test("2. een img zonder alt faalt met image-alt, selector en helpUrl", async ({ page }) => {
  await document(page, IMG_ZONDER_ALT);
  const fout = scanAxe(page);
  await expect(fout).rejects.toThrow(/axe \(WCAG 2\.2 AA\): 1 regel geschonden op /);
  await expect(scanAxe(page)).rejects.toThrow(/image-alt \[critical\]/);
  await expect(scanAxe(page)).rejects.toThrow(/• img/);
  await expect(scanAxe(page)).rejects.toThrow(/https:\/\/dequeuniversity\.com\/rules\/axe\/[\d.]+\/image-alt/);
});

test("3. te laag contrast faalt met color-contrast (wcag2aa staat aan)", async ({ page }) => {
  await document(page, '<main><h1>Kop</h1><p style="color:#bbb;background:#fff">Vage tekst</p></main>');
  await expect(scanAxe(page)).rejects.toThrow(/color-contrast \[serious\]/);
});

test("4. twee knoppen van 10x10 px naast elkaar falen met target-size (wcag22aa staat aan)", async ({ page }) => {
  await document(
    page,
    `<main><h1>Kop</h1><div style="display:flex">` +
      `<button aria-label="Een" style="width:10px;height:10px;min-width:0;padding:0;margin:0;border:0"></button>` +
      `<button aria-label="Twee" style="width:10px;height:10px;min-width:0;padding:0;margin:0;border:0"></button>` +
      `</div></main>`,
  );
  await expect(scanAxe(page)).rejects.toThrow(/target-size \[serious\]/);
});

test("5. twee main-elementen slagen zonder opties en falen met bestPractice", async ({ page }) => {
  await document(page, "<main><h1>Kop</h1></main><main><p>Tweede</p></main>");
  await scanAxe(page);
  await expect(scanAxe(page, { bestPractice: true })).rejects.toThrow(/landmark-no-duplicate-main/);
});

test("6. binnen: een violation buiten het gebied slaagt, binnen het gebied faalt", async ({ page }) => {
  await document(
    page,
    `<main><h1>Kop</h1><section id="schoon"><p>Tekst</p></section>` +
      `<section id="vuil"><img src="${PNG}" width="20" height="20"></section></main>`,
  );
  await scanAxe(page, { binnen: "#schoon" });
  await expect(scanAxe(page, { binnen: "#vuil" })).rejects.toThrow(/image-alt/);
});

test("7a. uitgezet: image-alt laat de img zonder alt slagen en zet een annotatie", async ({ page }) => {
  await document(page, IMG_ZONDER_ALT);
  await scanAxe(page, { uitgezet: [{ regel: "image-alt", reden: "test" }] });
  expect(test.info().annotations).toContainEqual({ type: "axe-uitzondering", description: "uitgezet: image-alt — test" });
});

test("7b. overslaan: img laat de img zonder alt slagen en zet een annotatie", async ({ page }) => {
  await document(page, IMG_ZONDER_ALT);
  await scanAxe(page, { overslaan: [{ selector: "img", reden: "test" }] });
  expect(test.info().annotations).toContainEqual({ type: "axe-uitzondering", description: "overslaan: img — test" });
});

test("7c. de uitzonderingen staan onder de kop van de melding", async ({ page }) => {
  await document(page, `<main><h1>Kop</h1><img src="${PNG}" width="20" height="20"><p style="color:#bbb;background:#fff">Vaag</p></main>`);
  await expect(scanAxe(page, { uitgezet: [{ regel: "image-alt", reden: "test" }] })).rejects.toThrow(
    /geschonden op .*\nuitgezet: image-alt — test\n\ncolor-contrast/,
  );
});

test("8. een lege reden of een onbekende regel is een fout vóór de scan", async ({ page }) => {
  await document(page, IMG_ZONDER_ALT);

  await expect(scanAxe(page, { uitgezet: [{ regel: "image-alt", reden: "" }] })).rejects.toThrow(
    "scanAxe: uitzondering zonder reden (image-alt)",
  );
  await expect(scanAxe(page, { uitgezet: [{ regel: "image-alt", reden: "   " }] })).rejects.toThrow(
    "scanAxe: uitzondering zonder reden (image-alt)",
  );
  await expect(scanAxe(page, { uitgezet: [{ regel: "", reden: "test" }] })).rejects.toThrow(
    "scanAxe: uitzondering zonder reden ()",
  );
  await expect(scanAxe(page, { overslaan: [{ selector: "img", reden: " " }] })).rejects.toThrow(
    "scanAxe: uitzondering zonder reden (img)",
  );
  await expect(scanAxe(page, { overslaan: [{ selector: "", reden: "test" }] })).rejects.toThrow(
    "scanAxe: uitzondering zonder reden ()",
  );
  await expect(scanAxe(page, { uitgezet: [{ regel: "bestaat-niet", reden: "test" }] })).rejects.toThrow(
    'scanAxe: onbekende axe-regel "bestaat-niet"',
  );

  // Vóór de scan: axe is nooit in de pagina geïnjecteerd en er is geen annotatie gezet.
  expect(await page.evaluate(() => "axe" in window)).toBe(false);
  expect(test.info().annotations.filter((a) => a.type === "axe-uitzondering")).toEqual([]);
});

test("9. zes elementen met dezelfde violation geven (+1 meer)", async ({ page }) => {
  const imgs = Array.from({ length: 6 }, (_, i) => `<img id="i${i}" src="${PNG}" width="20" height="20">`).join("");
  await document(page, `<main><h1>Kop</h1>${imgs}</main>`);
  const fout = await scanAxe(page).then(
    () => null,
    (e: Error) => e.message,
  );
  expect(fout).not.toBeNull();
  const tekst = fout ?? "";
  expect(tekst).toContain("(+1 meer)");
  expect(tekst.match(/• #i\d/g)).toHaveLength(5);
  expect(tekst).toContain("• #i4");
  expect(tekst).not.toContain("• #i5");
});
