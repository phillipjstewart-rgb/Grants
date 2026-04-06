import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Service-role client for API routes and server actions only.
 * Returns null when Supabase env is not configured (optional integration).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    cached = null;
    return null;
  }

  try {
    cached = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (e) {
    console.error("[supabase] createClient failed:", e instanceof Error ? e.message : e);
    cached = null;
  }
  return cached ?? null;
}
