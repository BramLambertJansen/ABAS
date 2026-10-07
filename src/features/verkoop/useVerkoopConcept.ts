"use client";

import { useState } from "react";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { CartLine } from "./cart";

/** Alleen het concept overleeft tabwissels; queries en overlays blijven lokaal. */
export function useVerkoopConcept() {
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  // Blijft staan tijdens 'wissel', om hetzelfde lid van een ander lid te onderscheiden.
  const [lastMemberId, setLastMemberId] = useState<string | null>(null);
  const [selectedMemberSnapshot, setSelectedMemberSnapshot] = useState<MemberOption | null>(null);
  // Bewaar namen en prijzen van mandjeregels, ook als een product intussen is gearchiveerd.
  const [productInfoCache, setProductInfoCache] = useState<Map<string, { name: string; priceCents: number }>>(new Map());

  return {
    cartLines, setCartLines,
    selectedMemberId, setSelectedMemberId,
    lastMemberId, setLastMemberId,
    selectedMemberSnapshot, setSelectedMemberSnapshot,
    productInfoCache, setProductInfoCache,
  };
}

export type VerkoopConcept = ReturnType<typeof useVerkoopConcept>;
