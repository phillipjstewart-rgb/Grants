from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ComplianceItem(BaseModel):
    requirement: str
    status: Literal["Met", "Partial", "Missing"]
    evidence_found: str = Field(
        default="",
        description="Quote or pointer to Company DNA / profile supporting the status",
    )
    remediation_action: str = Field(
        default="",
        description="Concrete next step to close the gap",
    )


class ComplianceMatrix(BaseModel):
    items: list[ComplianceItem] = Field(default_factory=list)
