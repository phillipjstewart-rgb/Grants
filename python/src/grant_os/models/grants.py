from __future__ import annotations

from pydantic import BaseModel, Field


class GrantRecord(BaseModel):
    """Single opportunity row extracted from a portal page."""

    title: str = Field(description="Official name of the grant or opportunity")
    agency: str = Field(description="Government body or organization offering it")
    eligibility: list[str] = Field(
        default_factory=list,
        description="Key applicant types (e.g. nonprofit, state, tribal, for-profit)",
    )
    closing_date: str = Field(description="Final submission or closing date as shown")
    funding_amount: str | None = Field(
        default=None,
        description="Funding ceiling, floor, or range if visible",
    )

    high_priority: bool = Field(
        default=False,
        description="True when eligibility explicitly includes for-profit organizations",
    )


class GrantPortalPage(BaseModel):
    """Wrapper schema for Firecrawl JSON extraction (list of rows)."""

    grants: list[GrantRecord] = Field(
        default_factory=list,
        description="Distinct funding opportunities found on this page",
    )
