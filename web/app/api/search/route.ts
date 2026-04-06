import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { runSemanticSearch } from "@/lib/runSemanticSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().min(1).max(2000),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  type: z.enum(["grant_opportunity", "pdf_analysis", "all"]).optional().default("all"),
});

function searchApiAuthorized(request: Request): boolean {
  const secret = process.env.SEARCH_API_KEY?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-search-key") === secret;
}

export async function GET(request: Request) {
  if (!searchApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const perMin = Number(process.env.SEARCH_RATE_LIMIT_PER_MIN ?? "30");
  const limitPerWindow = Number.isFinite(perMin) && perMin > 0 ? perMin : 30;
  if (isRateLimited(`search-api:${clientIp(request)}`, limitPerWindow, 60_000)) {
    return NextResponse.json({ error: "Too many search requests. Try again shortly." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    limit: searchParams.get("limit") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query: provide q= (1–2000 chars), optional limit (1–20), type." },
      { status: 400 }
    );
  }

  const out = await runSemanticSearch(parsed.data);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }

  return NextResponse.json({ results: out.results });
}
