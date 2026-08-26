"use client";

import { useState } from "react";

/**
 * Client-side switcher for the live design preview. The iframe always
 * points at /design/files/project/<name>, which re-reads the file from
 * disk on every load (see files/[...path]/route.ts) — switching the
 * <select> or refreshing the page never shows a stale, build-time copy.
 */
export function DesignBrowser({
  designFiles,
  chatFiles,
}: {
  designFiles: string[];
  chatFiles: string[];
}) {
  const [active, setActive] = useState(designFiles[0] ?? "");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Prototypes</h2>
          {designFiles.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              Scherm:
              <select
                className="rounded-control border border-border bg-canvas px-2 py-1"
                value={active}
                onChange={(e) => setActive(e.target.value)}
              >
                {designFiles.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {designFiles.length === 0 ? (
          <p className="text-sm text-muted">
            Geen bestanden gevonden in <code>project/</code>.
          </p>
        ) : (
          <>
            <iframe
              key={active}
              src={`/design/files/project/${encodeURIComponent(active)}`}
              title={active}
              className="h-[80vh] w-full rounded-card border border-border bg-white"
            />
            <a
              className="text-sm text-accent underline"
              href={`/design/files/project/${encodeURIComponent(active)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open &quot;{active}&quot; in eigen tab →
            </a>
          </>
        )}
      </section>

      {chatFiles.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Design-gesprekken ({chatFiles.length})
          </h2>
          <p className="text-sm text-muted">
            De transcripten achter de keuzes in de prototypes — waarom, niet
            bindend voor wat gebouwd wordt (zie docs/ARCHITECTURE.md →
            Bronmateriaal voor een onderwerp-index).
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {chatFiles.map((file) => (
              <li key={file}>
                <a
                  className="text-accent underline"
                  href={`/design/files/chats/${encodeURIComponent(file)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {file}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
