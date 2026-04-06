import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultEmbeddingModel, embedText } from "@/lib/grantOsEmbeddings";
import type { AnalyzerChatSource } from "@/types/documentAnalyzer";

const EXCERPT = 280;

export async function answerWithPgvectorContext(
  admin: SupabaseClient,
  params: {
    sessionId: string;
    apiKey: string;
    userPrompt: string;
  }
): Promise<{ text: string | null; error: string | null; sources: AnalyzerChatSource[] }> {
  const embedInput =
    params.userPrompt.length > 8000 ? `${params.userPrompt.slice(0, 8000)}…` : params.userPrompt;

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(params.apiKey, embedInput, defaultEmbeddingModel());
  } catch (e) {
    return {
      text: null,
      error: e instanceof Error ? e.message : "Embedding failed.",
      sources: [],
    };
  }

  const { data, error } = await admin.rpc("match_analyzer_chunks", {
    p_session_id: params.sessionId,
    query_embedding: queryEmbedding,
    match_count: 10,
  });

  if (error) {
    if (
      error.message.includes("match_analyzer_chunks") ||
      error.message.includes("function") ||
      error.code === "42883"
    ) {
      return {
        text: null,
        error:
          "Analyzer search function missing — apply migrations through 20260406220000_match_analyzer_chunks_citations.sql",
        sources: [],
      };
    }
    return { text: null, error: error.message, sources: [] };
  }

  const rows = (data ?? []) as {
    chunk_index?: number;
    content: string;
    similarity: number;
  }[];
  if (rows.length === 0) {
    return { text: null, error: "No indexed chunks found for this session.", sources: [] };
  }

  const sources: AnalyzerChatSource[] = rows.map((r) => ({
    kind: "pgvector" as const,
    excerpt: r.content.length > EXCERPT ? `${r.content.slice(0, EXCERPT)}…` : r.content,
    score: r.similarity,
    chunkIndex: r.chunk_index ?? 0,
  }));

  const openai = new OpenAI({ apiKey: params.apiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are a grants and procurement analyst. Answer using the CONTEXT excerpts below. If the context does not contain enough information, say what is missing. Be precise and professional. Where helpful, refer to passages as [1], [2], … matching the order of excerpt blocks in CONTEXT.",
      },
      {
        role: "user",
        content: `CONTEXT (numbered excerpt blocks from the user's PDF):\n\n${rows
          .map((r, i) => `[${i + 1}] (chunk ${r.chunk_index ?? "?"})\n${r.content}`)
          .join("\n\n---\n\n")}\n\n---\n\nQUESTION / TASK:\n${params.userPrompt}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return { text: text || null, error: null, sources };
}
