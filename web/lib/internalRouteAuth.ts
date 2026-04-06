import "server-only";

/** When set, POST /api/embeddings/backfill requires header x-grant-os-key. */
export function authorizeInternalRequest(request: Request): boolean {
  const secret = process.env.GRANT_OS_INTERNAL_KEY;
  if (!secret) return true;
  return request.headers.get("x-grant-os-key") === secret;
}
