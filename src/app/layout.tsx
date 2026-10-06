import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** Manrope, zelf gehost (SIL OFL, src/app/fonts/README.md): geen verzoek van
 *  het apparaat naar Google en geen netwerk tijdens `build`. */
const manrope = localFont({
  src: "./fonts/Manrope-Variable.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "ABAS",
  description: "Aurora Bar Automatiserings Systeem",
};

/**
 * True root: html/body only. Each shell (see src/shells/) gets its own
 * nested layout that wraps its route segment in a ShellProvider with its
 * own capabilities — nothing shell-specific belongs here.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
