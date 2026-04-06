import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultEmbeddingModel, embedText } from "@/lib/grantOsEmbeddings";

export async function answerWithPgvectorContext(
  admin: SupabaseClient,
  params: {
    sessionId: string;
    apiKey: string;
    userPrompt: string;
  }
): Promise<{ text: string | null; error: string | null }> {
  const embedInput =
    params.userPrompt.length > 8000 ? `${params.userPrompt.slice(0, 8000)}…` : params.userPrompt;

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(params.apiKey, embedInput, defaultEmbeddingModel());
  } catch (e) {
    return {
      text: null,
      error: e instanceof Error ? e.message : "Embedding failed.",
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
          "Analyzer search function missing — apply migration 20260406210000_document_analyzer_storage.sql",
      };
    }
    return { text: null, error: error.message };
  }

  const rows = (data ?? []) as { content: string; similarity: number }[];
  if (rows.length === 0) {
    return { text: null, error: "No indexed chunks found for this session." };
  }

  const context = rows.map((r) => r.content).join("\n\n---\n\n");
  const openai = new OpenAI({ apiKey: params.apiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are a grants and procurement analyst. Answer using the CONTEXT excerpts below. If the context does not contain enough information, say what is missing. Be precise and professional.",
      },
      {
        role: "user",
        content: `CONTEXT (excerpts from the user's PDF, retrieved by similarity):\n\n${context}\n\n---\n\nQUESTION / TASK:\n${params.userPrompt}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return { text: text || null, error: null };
}
