import "server-only";

function internalRouteSecret(): string | undefined {
  const a = process.env.GRANT_OS_INTERNAL_KEY?.trim();
  const b = process.env.INTERNAL_BACKFILL_KEY?.trim();
  return a || b || undefined;
}

/**
 * When a secret env is set, require one of:
 * - `x-grant-os-key: <secret>`
 * - `Authorization: Bearer <secret>`
 */
export function authorizeInternalRequest(request: Request): boolean {
  const secret = internalRouteSecret();
  if (!secret) return true;

  if (request.headers.get("x-grant-os-key") === secret) {
    return true;
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token === secret) return true;
  }

  return false;
}
