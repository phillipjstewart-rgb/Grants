from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx

from grant_os.models.grants import GrantRecord


def _rest_config() -> tuple[str, str] | None:
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    ).rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        return None
    return url, key


def upsert_grant_rows(records: list[GrantRecord], source_url: str) -> int:
    """POST rows to PostgREST with upsert on (source_url, title). Returns rows sent."""
    cfg = _rest_config()
    if not cfg:
        print(
            "Supabase upsert skipped: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) "
            "and SUPABASE_SERVICE_ROLE_KEY.",
            file=sys.stderr,
        )
        return 0
    base, key = cfg
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    rows: list[dict[str, Any]] = []
    for r in records:
        rows.append(
            {
                "source_url": source_url,
                "title": r.title,
                "agency": r.agency or "",
                "eligibility": r.eligibility,
                "closing_date": r.closing_date or "",
                "funding_amount": r.funding_amount,
                "high_priority": r.high_priority,
                "raw": r.model_dump(),
            }
        )
    if not rows:
        return 0
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{base}/rest/v1/grant_opportunities?on_conflict=source_url,title",
            headers=headers,
            content=json.dumps(rows),
        )
        resp.raise_for_status()
    return len(rows)


def trigger_embeddings_backfill() -> None:
    """POST to Next.js /api/embeddings/backfill (optional GRANT_OS_INTERNAL_KEY)."""
    app_url = (os.environ.get("GRANT_OS_APP_URL") or "").rstrip("/")
    if not app_url:
        print("Embeddings backfill skipped: GRANT_OS_APP_URL not set.", file=sys.stderr)
        return
    secret = os.environ.get("GRANT_OS_INTERNAL_KEY") or ""
    headers: dict[str, str] = {}
    if secret:
        headers["x-grant-os-key"] = secret
    try:
        with httpx.Client(timeout=600.0) as client:
            resp = client.post(f"{app_url}/api/embeddings/backfill", headers=headers)
            resp.raise_for_status()
            snippet = resp.text[:500] if resp.text else "(empty body)"
        print("Embeddings backfill OK:", snippet, file=sys.stderr)
    except httpx.HTTPError as exc:
        print("Embeddings backfill failed:", exc, file=sys.stderr)
