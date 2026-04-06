from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_URL = os.environ.get(
    "USASPENDING_API_URL",
    "https://api.usaspending.gov/api/v2/search/spending_by_award/",
)


def fetch_spending_by_award(
    keywords: list[str],
    *,
    limit: int = 10,
    start_date: str = "2024-01-01",
    end_date: str = "2026-12-31",
) -> list[dict[str, Any]]:
    """
    Query USASpending public search API for historical awards (grants / loans family).
    Payload shape follows the v2 spending_by_award endpoint; adjust if API changes.
    """

    payload: dict[str, Any] = {
        "filters": {
            "keywords": keywords,
            "award_type_codes": ["02", "03", "04", "05"],
            "time_period": [{"start_date": start_date, "end_date": end_date}],
        },
        "fields": [
            "Award ID",
            "Recipient Name",
            "Award Amount",
            "Description",
            "Awarding Agency",
            "Start Date",
            "End Date",
        ],
        "page": 1,
        "limit": limit,
        "sort": "Award Amount",
        "order": "desc",
    }
    with httpx.Client(timeout=60) as client:
        response = client.post(DEFAULT_URL, json=payload)
        response.raise_for_status()
        body = response.json()
    return list(body.get("results") or [])
