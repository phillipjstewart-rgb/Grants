from __future__ import annotations

import os

import anthropic

from grant_os.llm_config import anthropic_model
from grant_os.redaction import redact_sensitive_info


def draft_response_letter(
    compliance_matrix: dict,
    page_reference_map: dict[str, str],
) -> str:
    """
    Draft a formal response letter that:
    - Ingests the compliance matrix
    - References solicitation page numbers (provided in page_reference_map: requirement -> 'p. 12')
    - Uses an authoritative, collaborative tone
    - Uses plain paragraphs suitable for ReportLab (no markdown tables required)
    """

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Set ANTHROPIC_API_KEY.")

    client = anthropic.Anthropic(api_key=key)
    matrix = redact_sensitive_info(json.dumps(compliance_matrix, indent=2)[:200_000])
    refs = redact_sensitive_info(json.dumps(page_reference_map, indent=2)[:80_000])
    msg = client.messages.create(
        model=anthropic_model(),
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": (
                    "Write a formal response letter for a government or institutional solicitation.\n"
                    "Tone: authoritative yet collaborative; active voice; no marketing fluff.\n"
                    "Structure:\n"
                    "1) Opening — acknowledge the opportunity and scope.\n"
                    "2) Compliance narrative — walk requirement-by-requirement; for each, cite "
                    "the solicitation page using the reference map when available.\n"
                    "3) Closing — offer structured collaboration toward award.\n"
                    "Embed page citations like (Solicitation p. 14) inline.\n\n"
                    f"COMPLIANCE_MATRIX_JSON:\n{matrix}\n\nPAGE_REFERENCE_MAP_JSON:\n{refs}"
                ),
            }
        ],
    )
    block = msg.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected Anthropic response shape.")
    return block.text
