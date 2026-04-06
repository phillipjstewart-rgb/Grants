import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

export async function upsertGrantOsEmbedding(
  admin: SupabaseClient,
  params: {
    sourceType: GrantOsEmbeddingSource;
    sourceId: string;
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
      content,
      embedding: params.embedding,
    },
    { onConflict: "source_type,source_id" }
  );
  return { error: error?.message ?? null };
}

export type MatchRow = {
  source_type: string;
  source_id: string;
  content: string;
  similarity: number;
};

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
