import { NextResponse } from "next/server";
import { z } from "zod";

import {
  embedText,
  matchGrantOsEmbeddings,
  type GrantOsEmbeddingSource,
} from "@/lib/grantOsEmbeddings";
import { getSupabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().min(1).max(2000),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  type: z.enum(["grant_opportunity", "pdf_analysis", "all"]).optional().default("all"),
});

export async function GET(request: Request) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    limit: searchParams.get("limit") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query: provide q= (1–2000 chars), optional limit (1–20), type." }, { status: 400 });
  }

  const { q, limit, type } = parsed.data;
  const filterType: GrantOsEmbeddingSource | null =
    type === "all" ? null : (type as GrantOsEmbeddingSource);

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(openaiKey, q);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Embedding request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data, error } = await matchGrantOsEmbeddings(admin, queryEmbedding, limit, filterType);
  if (error) {
    return NextResponse.json(
      {
        error:
          error.includes("match_grant_os_embeddings") || error.includes("function")
            ? "Search RPC missing — apply migration supabase/migrations/20260406150000_grant_os_pgvector_embeddings.sql"
            : error,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ results: data ?? [] });
}
