import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DesignBrowser } from "./DesignBrowser";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ABAS — design (live)",
  robots: { index: false, follow: false },
};

/**
 * Findable-in-the-app view of /designs/ (CLAUDE.md → Designbestanden).
 * Reads it from disk on every request (see files/[...path]/route.ts)
 * instead of a build-time snapshot, so this always reflects whatever's
 * currently checked out — an agent (or Bram) building a screen can open
 * /design and see the current prototype without digging through the repo
 * tree first. The repo tree itself is the primary way an agent finds this
 * (a top-level /designs/ folder, not this route) — this page is the
 * secondary, visual way to look at it.
 *
 * Not a shell, not a feature: this is tooling for the build process itself,
 * so it deliberately sits outside src/shells/ and src/features/ and isn't
 * part of the WCAG-AA gate's route list (e2e/a11y.spec.ts) — it's scanning
 * a third-party prototype file we don't control the markup of.
 *
 * Open question for Bram: this route ships in every environment, including
 * a production deploy, with no auth gate. Fine for now (the bundle is
 * already in the repo), but worth an explicit call before this is public.
 */
export default async function DesignIndexPage() {
  const designsDir = path.join(process.cwd(), "designs");
  const chatsDir = path.join(designsDir, "chats");

  const designEntries = await readdir(designsDir, { withFileTypes: true }).catch(() => []);
  const designFiles = designEntries
    .filter((e) => e.isFile() && /\.html$/i.test(e.name))
    .map((e) => e.name)
    .sort();

  const chatEntries = await readdir(chatsDir, { withFileTypes: true }).catch(() => []);
  const chatFiles = chatEntries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+/)?.[0] ?? 0);
      return na - nb;
    });

  const readme = await readFile(path.join(designsDir, "README.md"), "utf8").catch(() => null);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">ABAS — design (live)</h1>
        <p className="text-sm text-muted">
          Live weergave van <code>/designs/</code> — geen kopie, elke
          request leest opnieuw van schijf. Bepaalt de eerste bouw van een
          scherm; daarna is het in-app design system de waarheid
          (CLAUDE.md → Designbestanden).
        </p>
      </header>

      {readme && (
        <details className="rounded-sm border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Handoff-notes (designs/README.md)
          </summary>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-muted">{readme}</pre>
        </details>
      )}

      <DesignBrowser designFiles={designFiles} chatFiles={chatFiles} />
    </main>
  );
}
