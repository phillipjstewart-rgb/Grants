import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function persistAnalyzerSession(
  admin: SupabaseClient,
  params: {
    sessionId: string;
    filename: string;
    charCount: number;
    chunks: string[];
    embeddings: number[][];
  }
): Promise<{ error: string | null }> {
  if (params.chunks.length !== params.embeddings.length) {
    return { error: "Chunks and embeddings length mismatch." };
  }

  const { error: sErr } = await admin.from("document_analyzer_sessions").insert({
    id: params.sessionId,
    filename: params.filename,
    char_count: params.charCount,
  });
  if (sErr) {
    return { error: sErr.message };
  }

  const rows = params.chunks.map((content, i) => ({
    session_id: params.sessionId,
    chunk_index: i,
    content: content.length > 32000 ? `${content.slice(0, 32000)}…` : content,
    embedding: params.embeddings[i]!,
  }));

  const { error: cErr } = await admin.from("document_analyzer_chunks").insert(rows);
  if (cErr) {
    await admin.from("document_analyzer_sessions").delete().eq("id", params.sessionId);
    return { error: cErr.message };
  }

  return { error: null };
}

export async function sessionExistsInDb(
  admin: SupabaseClient,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("document_analyzer_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}
