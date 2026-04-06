import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

import type { SemanticSearchHit } from "@/types/semanticSearch";

/** Must match migration `vector(1536)` and OpenAI text-embedding-3-small default output. */
export const GRANT_OS_EMBEDDING_DIMENSIONS = 1536;

const MAX_EMBED_CHARS = 24_000;

export type GrantOsEmbeddingSource = "grant_opportunity" | "pdf_analysis";

export function defaultEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}

export function grantOpportunityToEmbeddingText(row: {
  title: string;
  agency: string;
  eligibility: string[];
  closing_date?: string | null;
  funding_amount?: string | null;
}): string {
  const lines = [
    row.title,
    row.agency,
    ...(row.eligibility ?? []),
    row.closing_date ?? "",
    row.funding_amount ?? "",
  ].filter((s) => s.length > 0);
  return lines.join("\n");
}

export async function embedText(
  apiKey: string,
  text: string,
  model = defaultEmbeddingModel()
): Promise<number[]> {
  const input = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  const openai = new OpenAI({ apiKey });
  const res = await openai.embeddings.create({ model, input });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== GRANT_OS_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding length was ${vec?.length}; expected ${GRANT_OS_EMBEDDING_DIMENSIONS}.`);
  }
  return vec;
}

export async function deleteGrantOsEmbeddingsForSource(
  admin: SupabaseClient,
  sourceType: GrantOsEmbeddingSource,
  sourceId: string
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("grant_os_embeddings")
    .delete()
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  return { error: error?.message ?? null };
}

export async function upsertGrantOsEmbedding(
  admin: SupabaseClient,
  params: {
    sourceType: GrantOsEmbeddingSource;
    sourceId: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
  }
): Promise<{ error: string | null }> {
  const content =
    params.content.length > 32000 ? `${params.content.slice(0, 32000)}…` : params.content;
  const { error } = await admin.from("grant_os_embeddings").upsert(
    {
      source_type: params.sourceType,
      source_id: params.sourceId,
      chunk_index: params.chunkIndex,
      content,
      embedding: params.embedding,
    },
    { onConflict: "source_type,source_id,chunk_index" }
  );
  return { error: error?.message ?? null };
}

/** Keep the single best-matching row per (source_type, source_id) after chunk-level retrieval. */
export function dedupeMatchRowsBySource(rows: MatchRow[], limit: number): MatchRow[] {
  const best = new Map<string, MatchRow>();
  for (const r of rows) {
    const k = `${r.source_type}:${r.source_id}`;
    const prev = best.get(k);
    if (!prev || r.similarity > prev.similarity) best.set(k, r);
  }
  return [...best.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export type MatchRow = SemanticSearchHit;

export async function matchGrantOsEmbeddings(
  admin: SupabaseClient,
  queryEmbedding: number[],
  matchCount: number,
  filterSourceType: GrantOsEmbeddingSource | null
): Promise<{ data: MatchRow[] | null; error: string | null }> {
  const { data, error } = await admin.rpc("match_grant_os_embeddings", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_source_type: filterSourceType,
  });
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data as MatchRow[]) ?? [], error: null };
}
