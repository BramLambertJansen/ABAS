import { Assortimentbeheer } from "@/features/assortimentbeheer/Assortimentbeheer";

/**
 * Thin routing wrapper only — same pattern as src/app/(bar)/page.tsx. The
 * real screen lives in src/features/assortimentbeheer/ and stays
 * shell-agnostic per CLAUDE.md → Shells. See
 * docs/features/assortimentbeheer.md → "Betrokken shell" for why this is
 * its own route rather than a knop on DienstActief.
 */
export default function BeheerPage() {
  return <Assortimentbeheer />;
}
