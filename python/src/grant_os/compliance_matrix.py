from __future__ import annotations

import json
import os
from pathlib import Path

import anthropic

from grant_os.llm_config import anthropic_model
from grant_os.llm_json import parse_json_object
from grant_os.models.compliance import ComplianceMatrix
from grant_os.redaction import redact_sensitive_info


def build_compliance_matrix(
    grant_requirements_json: dict | list,
    company_dna_md: str,
) -> ComplianceMatrix:
    """
    Map structured grant requirements + company markdown into a ComplianceMatrix using Claude.
    """

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Set ANTHROPIC_API_KEY.")

    client = anthropic.Anthropic(api_key=key)
    req = redact_sensitive_info(json.dumps(grant_requirements_json, indent=2)[:120_000])
    dna = redact_sensitive_info(company_dna_md[:120_000])
    schema = ComplianceMatrix.model_json_schema()
    msg = client.messages.create(
        model=anthropic_model(),
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a proposal compliance lead. Build a compliance matrix from the "
                    "grant requirements JSON and the company DNA markdown.\n"
                    "Return ONLY JSON matching this schema:\n"
                    f"{json.dumps(schema)}\n\n"
                    "Each requirement should be atomic. Status must be Met, Partial, or Missing. "
                    "evidence_found should cite facts from the company DNA when Met/Partial. "
                    "remediation_action must name the exact artifact, cert, metric, or process "
                    "needed to reach 100% compliance.\n\n"
                    f"GRANT_REQUIREMENTS_JSON:\n{req}\n\nCOMPANY_DNA_MD:\n{dna}"
                ),
            }
        ],
    )
    block = msg.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected Anthropic response shape.")
    data = parse_json_object(block.text)
    return ComplianceMatrix.model_validate(data)


def load_json_path(path: Path) -> dict | list:
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)
