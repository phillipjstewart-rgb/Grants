import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  priority: z.enum(["high", "all"]).optional().default("all"),
});

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  const { limit, priority } = parsed.data;
  let q = admin
    .from("grant_opportunities")
    .select(
      "id, created_at, source_url, title, agency, eligibility, closing_date, funding_amount, high_priority"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (priority === "high") {
    q = q.eq("high_priority", true);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ grants: data ?? [] });
}
