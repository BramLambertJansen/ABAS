"use client";

import Image from "next/image";
import { useState } from "react";
import { initials } from "@/lib/staff";

/**
 * Het afbeeldingsvlak van een product (docs/features/productafbeeldingen.md
 * → Componenten). Eén component voor de vier plekken uit de wireframe; vaste
 * `size`-varianten, net als InitialsAvatar, geen vrije px-waarden bij de
 * aanroeper:
 * - "tile" — verkoop-galerij: volle kaartbreedte × 92px in een canvas-kader
 *   (Besluit 3);
 * - "row" — verkoop-lijst, 42px;
 * - "beheerRow" — beheer-productenlijst, 38px;
 * - "detail" — kop van Product beheren, 52px.
 *
 * De afbeelding staat passend (`object-contain`) op de canvas-ondergrond,
 * zonder bijsnijden (Besluit 4). Zonder afbeelding, of als hij niet laadt,
 * de lege staat: hetzelfde vlak met de initialen van de naam, `aria-hidden`
 * (Besluit 2) — nooit een kapot-beeldicoon.
 *
 * `decorative`: de naam staat er direct naast en zit al in de `aria-label`
 * van de knop, dus `alt=""` (Besluit 11). Anders `Afbeelding van {naam}`.
 * `dimmed`: een gearchiveerd product in de beheerlijst, gedempt zoals de
 * rest van de rij.
 *
 * `next/image` met `unoptimized`: de server levert al de juiste maat (max.
 * 512px WebP), dus geen optimalisatie-API en geen `remotePatterns` nodig.
 */
export function ProductAfbeelding({
  imageUrl,
  name,
  size,
  decorative = false,
  dimmed = false,
}: {
  imageUrl: string | null;
  name: string;
  size: "tile" | "row" | "beheerRow" | "detail";
  decorative?: boolean;
  dimmed?: boolean;
}) {
  // De URL die niet laadde; een nieuwe URL (na vervangen) krijgt weer een kans.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = imageUrl !== null && imageUrl !== failedUrl;

  const vlak =
    size === "tile"
      ? "h-[92px] w-full rounded-lg"
      : size === "row"
        ? "h-[42px] w-[42px] rounded-lg"
        : size === "beheerRow"
          ? "h-[38px] w-[38px] rounded-lg"
          : "h-[52px] w-[52px] rounded-xl";
  const tekst = size === "tile" ? "text-xl" : size === "detail" ? "text-base" : "text-xs";
  const pxBreed = size === "row" ? 42 : size === "beheerRow" ? 38 : size === "detail" ? 52 : 160;

  const inhoud = showImage ? (
    <span className={`relative block flex-none overflow-hidden bg-canvas ${vlak}`}>
      <Image
        src={imageUrl}
        alt={decorative ? "" : `Afbeelding van ${name}`}
        fill
        sizes={`${pxBreed}px`}
        unoptimized
        loading="lazy"
        onError={() => setFailedUrl(imageUrl)}
        className={`object-contain ${dimmed ? "opacity-60" : ""}`}
      />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center bg-canvas font-extrabold ${
        dimmed ? "text-muted" : "text-muted-strong"
      } ${vlak} ${tekst}`}
    >
      {initials(name)}
    </span>
  );

  if (size !== "tile") return inhoud;

  // Galerij: het kader uit de wireframe (canvas, 6px rand, radius 11).
  return <span className="block w-full rounded-[11px] bg-canvas p-1.5">{inhoud}</span>;
}
