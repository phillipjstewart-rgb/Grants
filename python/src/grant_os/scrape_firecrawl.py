from __future__ import annotations

import json
import os
from pathlib import Path

from firecrawl import Firecrawl

from grant_os.models.grants import GrantPortalPage, GrantRecord


def _for_profit_priority(record: GrantRecord) -> GrantRecord:
    blob = " ".join(record.eligibility).lower()
    flagged = "for-profit" in blob or "for profit" in blob
    return record.model_copy(update={"high_priority": flagged})


DEFAULT_PROMPT = """Extract every distinct grant or funding opportunity visible on this page.
For each, capture title, agency, eligibility categories, closing date, and funding amount if shown.
If the page is a portal shell without concrete opportunities, return an empty grants array."""


def scrape_grants_portal(url: str, *, api_key: str | None = None) -> list[GrantRecord]:
    key = api_key or os.environ.get("FIRECRAWL_API_KEY")
    if not key:
        raise RuntimeError("Set FIRECRAWL_API_KEY in the environment.")

    app = Firecrawl(api_key=key)
    schema = GrantPortalPage.model_json_schema()
    doc = app.scrape(
        url,
        formats=[
            {
                "type": "json",
                "schema": schema,
                "prompt": DEFAULT_PROMPT,
            }
        ],
        only_main_content=True,
    )

    raw = doc.json
    if raw is None:
        return []

    if isinstance(raw, dict) and "grants" in raw:
        payload = GrantPortalPage.model_validate(raw)
    elif isinstance(raw, list):
        payload = GrantPortalPage(grants=[GrantRecord.model_validate(x) for x in raw])
    else:
        payload = GrantPortalPage.model_validate(raw)

    return [_for_profit_priority(g) for g in payload.grants]


def save_grants_json(records: list[GrantRecord], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [r.model_dump() for r in records]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
