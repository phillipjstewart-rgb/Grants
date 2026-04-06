from __future__ import annotations

import json
import re


def parse_json_object(text: str) -> dict:
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text, re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)
