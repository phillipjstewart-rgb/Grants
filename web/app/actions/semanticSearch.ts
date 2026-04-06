"use server";

import { headers } from "next/headers";

import { clientIpFromHeaders, isRateLimited } from "@/lib/rateLimit";
import { runSemanticSearch } from "@/lib/runSemanticSearch";
import type { SemanticSearchHit } from "@/types/semanticSearch";

export type SemanticSearchActionResult =
  | { ok: true; results: SemanticSearchHit[] }
  | { ok: false; error: string; status: number };

export async function semanticSearchAction(form: {
  q: string;
  limit?: number;
  type: "all" | "grant_opportunity" | "pdf_analysis";
}): Promise<SemanticSearchActionResult> {
  const h = await headers();
  const perMin = Number(process.env.SEARCH_RATE_LIMIT_PER_MIN ?? "30");
  const limitPerWindow = Number.isFinite(perMin) && perMin > 0 ? perMin : 30;
  if (isRateLimited(`search-ui:${clientIpFromHeaders(h)}`, limitPerWindow, 60_000)) {
    return { ok: false, status: 429, error: "Too many search requests. Try again shortly." };
  }

  const out = await runSemanticSearch({
    q: form.q.trim(),
    limit: form.limit ?? 12,
    type: form.type,
  });
  if (!out.ok) {
    return { ok: false, status: out.status, error: out.error };
  }
  return { ok: true, results: out.results };
}
