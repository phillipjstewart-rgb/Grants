import "server-only";

import { z } from "zod";

import {
  dedupeMatchRowsBySource,
  embedText,
  matchGrantOsEmbeddings,
  type GrantOsEmbeddingSource,
} from "@/lib/grantOsEmbeddings";
import { getSupabaseAdmin } from "@/lib/supabase/serverAdmin";
import type { SemanticSearchHit } from "@/types/semanticSearch";

const inputSchema = z.object({
  q: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(20).default(10),
  type: z.enum(["grant_opportunity", "pdf_analysis", "all"]).default("all"),
});

export type SemanticSearchResponse =
  | { ok: true; results: SemanticSearchHit[] }
  | { ok: false; status: number; error: string };

export async function runSemanticSearch(
  raw: z.input<typeof inputSchema>
): Promise<SemanticSearchResponse> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid search parameters." };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return { ok: false, status: 500, error: "OPENAI_API_KEY is not configured on the server." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).",
    };
  }

  const { q, limit, type } = parsed.data;
  const filterType: GrantOsEmbeddingSource | null =
    type === "all" ? null : (type as GrantOsEmbeddingSource);

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(openaiKey, q);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Embedding request failed.";
    return { ok: false, status: 502, error: message };
  }

  const candidateCap = Math.min(Math.max(limit * 6, 24), 120);
  const { data, error } = await matchGrantOsEmbeddings(
    admin,
    queryEmbedding,
    candidateCap,
    filterType
  );
  if (error) {
    const hint =
      error.includes("match_grant_os_embeddings") || error.includes("function")
        ? "Search RPC missing — apply Supabase migrations under supabase/migrations/"
        : error;
    return { ok: false, status: 500, error: hint };
  }

  const deduped = dedupeMatchRowsBySource(data ?? [], limit);
  return { ok: true, results: deduped };
}
