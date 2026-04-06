import { NextResponse } from "next/server";

import {
  defaultEmbeddingModel,
  embedText,
  grantOpportunityToEmbeddingText,
  upsertGrantOsEmbedding,
} from "@/lib/grantOsEmbeddings";
import { authorizeInternalRequest } from "@/lib/internalRouteAuth";
import { getSupabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const model = defaultEmbeddingModel();
  let grantsIndexed = 0;
  let pdfsIndexed = 0;
  const errors: string[] = [];

  const { data: embeddedRows, error: embListError } = await admin
    .from("grant_os_embeddings")
    .select("source_type, source_id");

  if (embListError) {
    if (
      embListError.message.includes("grant_os_embeddings") ||
      embListError.code === "42P01"
    ) {
      return NextResponse.json(
        {
          error:
            "Table grant_os_embeddings not found — apply migration 20260406150000_grant_os_pgvector_embeddings.sql",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: embListError.message }, { status: 500 });
  }

  const embedded = new Set(
    (embeddedRows ?? []).map((r) => `${r.source_type}:${r.source_id}`)
  );

  const { data: grants, error: grantsError } = await admin
    .from("grant_opportunities")
    .select("id, title, agency, eligibility, closing_date, funding_amount");

  if (grantsError) {
    return NextResponse.json({ error: grantsError.message }, { status: 500 });
  }

  for (const g of grants ?? []) {
    const key = `grant_opportunity:${g.id}`;
    if (embedded.has(key)) continue;
    const text = grantOpportunityToEmbeddingText({
      title: g.title,
      agency: g.agency ?? "",
      eligibility: g.eligibility ?? [],
      closing_date: g.closing_date,
      funding_amount: g.funding_amount,
    });
    if (!text.trim()) continue;
    try {
      const embedding = await embedText(openaiKey, text, model);
      const { error } = await upsertGrantOsEmbedding(admin, {
        sourceType: "grant_opportunity",
        sourceId: g.id,
        content: text,
        embedding,
      });
      if (error) {
        errors.push(`grant ${g.id}: ${error}`);
      } else {
        grantsIndexed += 1;
        embedded.add(key);
      }
    } catch (e) {
      errors.push(`grant ${g.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const { data: pdfs, error: pdfsError } = await admin
    .from("pdf_analyses")
    .select("id, summary");

  if (pdfsError) {
    return NextResponse.json({ error: pdfsError.message }, { status: 500 });
  }

  for (const p of pdfs ?? []) {
    const key = `pdf_analysis:${p.id}`;
    if (embedded.has(key)) continue;
    const text = p.summary ?? "";
    if (!text.trim()) continue;
    try {
      const embedding = await embedText(openaiKey, text, model);
      const { error } = await upsertGrantOsEmbedding(admin, {
        sourceType: "pdf_analysis",
        sourceId: p.id,
        content: text,
        embedding,
      });
      if (error) {
        errors.push(`pdf ${p.id}: ${error}`);
      } else {
        pdfsIndexed += 1;
        embedded.add(key);
      }
    } catch (e) {
      errors.push(`pdf ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    model,
    grantsIndexed,
    pdfsIndexed,
    errors: errors.length ? errors : undefined,
  });
}
