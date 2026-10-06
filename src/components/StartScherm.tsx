import type { ReactNode } from "react";

/** Presentatie van donkere startschermen; login, sessie en focus blijven bij de feature. */
export function StartScherm({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-auto bg-rail px-6 py-8 font-sans text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-rail-glow" />
      {children}
    </main>
  );
}
