"use client";

import { useState } from "react";
import type { MemberOption } from "@/hooks/queries/useMembers";
import type { CartLine } from "./cart";

/** Alleen de invoer en laatst bekende weergave-info blijven bij tabwissels
 * bestaan. Queries en dialogen horen bij het actieve verkoopscherm.
 * DienstTabs wordt per sessie/dienst gemount; geen browseropslag. */
export function useVerkoopDraft() {
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [lastMemberId, setLastMemberId] = useState<string | null>(null);
  const [selectedMemberSnapshot, setSelectedMemberSnapshot] = useState<MemberOption | null>(null);
  const [productInfoCache, setProductInfoCache] = useState<Map<string, { name: string; priceCents: number }>>(() => new Map());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [memberQuery, setMemberQuery] = useState("");

  return {
    cartLines, setCartLines, selectedMemberId, setSelectedMemberId,
    lastMemberId, setLastMemberId, selectedMemberSnapshot, setSelectedMemberSnapshot,
    productInfoCache, setProductInfoCache, query, setQuery, category, setCategory,
    view, setView, memberQuery, setMemberQuery,
  };
}

export type VerkoopDraft = ReturnType<typeof useVerkoopDraft>;
export type AssortimentView = Pick<VerkoopDraft, "query" | "setQuery" | "category" | "setCategory" | "view" | "setView">;
