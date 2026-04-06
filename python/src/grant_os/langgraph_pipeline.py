from __future__ import annotations

import json
import os
from typing import TypedDict

import anthropic
from langgraph.graph import END, StateGraph

from grant_os.llm_config import anthropic_model
from grant_os.llm_json import parse_json_object
from grant_os.usaspending import fetch_spending_by_award


class PipelineState(TypedDict, total=False):
    keywords: list[str]
    intel_summary: str
    proposal_draft: str
    compliance_matrix: dict
    approval_score: float
    auditor_feedback: str
    iteration: int


def _require_anthropic() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Set ANTHROPIC_API_KEY for the LangGraph demo.")
    return anthropic.Anthropic(api_key=key)


def node_usaspending(state: PipelineState) -> PipelineState:
    kws = state.get("keywords") or ["research"]
    rows = fetch_spending_by_award(kws, limit=5)
    lines = [
        f"- {r.get('Recipient Name', 'Unknown')} | ${r.get('Award Amount', 'N/A')} | "
        f"{(r.get('Description') or '')[:160]}"
        for r in rows
    ]
    return {"intel_summary": "Historical awards sample:\n" + "\n".join(lines)}


def node_writer(state: PipelineState) -> PipelineState:
    client = _require_anthropic()
    intel = state.get("intel_summary", "")
    feedback = state.get("auditor_feedback", "")
    msg = client.messages.create(
        model=anthropic_model(),
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": (
                    "Draft a short SBIR-style technical approach (800 words max) using the "
                    "historical award themes below. If auditor feedback is present, incorporate it.\n\n"
                    f"INTEL:\n{intel}\n\nAUDITOR_FEEDBACK:\n{feedback}"
                ),
            }
        ],
    )
    block = msg.content[0]
    text = block.text if block.type == "text" else ""
    return {"proposal_draft": text, "iteration": state.get("iteration", 0) + 1}


def node_auditor(state: PipelineState) -> PipelineState:
    client = _require_anthropic()
    draft = state.get("proposal_draft", "")
    matrix = state.get("compliance_matrix") or {"items": []}
    msg = client.messages.create(
        model=anthropic_model(),
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a critical compliance auditor. Score the draft against the matrix JSON. "
                    "Return ONLY JSON: {\"approval_score\": 0.0-1.0, \"feedback\": string}. "
                    "Use 1.0 only if every requirement is explicitly addressed with evidence.\n\n"
                    f"MATRIX:\n{json.dumps(matrix)}\n\nDRAFT:\n{draft[:120_000]}"
                ),
            }
        ],
    )
    block = msg.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected auditor response.")
    data = parse_json_object(block.text)
    return {
        "approval_score": float(data.get("approval_score", 0)),
        "auditor_feedback": str(data.get("feedback", "")),
    }


def node_pdf_stub(state: PipelineState) -> PipelineState:
    # Final artifact is produced by `grant-pdf` / ReportLab in production.
    return state


def supervisor(state: PipelineState) -> str:
    if float(state.get("approval_score", 0)) >= 1.0:
        return "pdf"
    if state.get("iteration", 0) >= 3:
        return "pdf"
    return "writer"


def build_app():
    g = StateGraph(PipelineState)
    g.add_node("intel", node_usaspending)
    g.add_node("writer", node_writer)
    g.add_node("auditor", node_auditor)
    g.add_node("pdf", node_pdf_stub)
    g.set_entry_point("intel")
    g.add_edge("intel", "writer")
    g.add_edge("writer", "auditor")
    g.add_conditional_edges("auditor", supervisor, {"writer": "writer", "pdf": "pdf"})
    g.add_edge("pdf", END)
    return g.compile()


def run_demo(keywords: list[str], compliance_matrix: dict | None = None) -> PipelineState:
    app = build_app()
    initial: PipelineState = {
        "keywords": keywords,
        "compliance_matrix": compliance_matrix or {"items": []},
        "iteration": 0,
    }
    return app.invoke(initial)
