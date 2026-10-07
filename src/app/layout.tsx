import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/Manrope-Variable.ttf",
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
