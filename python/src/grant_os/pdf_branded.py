from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


def _draw_header_footer(
    canvas: pdfcanvas.Canvas, doc: SimpleDocTemplate, brand: dict[str, Any]
) -> None:
    canvas.saveState()
    name = brand.get("company_name", "")
    canvas.setFont("Times-Roman", 9)
    canvas.setFillColor(colors.HexColor(brand.get("footer_color", "#333333")))
    canvas.drawString(inch, 0.65 * inch, name)
    canvas.drawRightString(LETTER[0] - inch, 0.65 * inch, f"Page {doc.page}")
    canvas.restoreState()


def generate_branded_proposal(
    output_path: Path,
    content_json: dict[str, Any],
    company_logo_path: Path | None,
    brand_config_path: Path,
) -> None:
    """Letterhead PDF with government-style body copy and a simple table of contents."""

    brand = json.loads(brand_config_path.read_text(encoding="utf-8"))
    primary = brand.get("primary_color", "#1e3a5f")

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="BodyGov",
            parent=styles["Normal"],
            fontName="Times-Roman",
            fontSize=12,
            leading=14,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1Center",
            parent=styles["Heading1"],
            fontName="Times-Bold",
            alignment=1,
            textColor=colors.HexColor(primary),
            spaceAfter=12,
        )
    )

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=LETTER,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=1.5 * inch,
        bottomMargin=inch,
    )

    story: list[Any] = []
    sections = content_json.get("sections", [])
    headers = [s.get("header", f"Section {i}") for i, s in enumerate(sections, start=1)]

    if company_logo_path and company_logo_path.is_file():
        logo = Image(str(company_logo_path), 2 * inch, 0.75 * inch)
        logo.hAlign = "RIGHT"
        story.append(logo)
        story.append(Spacer(1, 0.35 * inch))

    story.append(Paragraph(content_json.get("title", "Proposal"), styles["H1Center"]))
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("<b>Table of Contents</b>", styles["Heading2"]))
    story.append(Spacer(1, 0.1 * inch))
    for i, h in enumerate(headers, start=1):
        story.append(Paragraph(f"{i}. {h}", styles["BodyGov"]))
    story.append(PageBreak())

    for section in sections:
        header = section.get("header", "Section")
        story.append(Paragraph(f"<b>{header}</b>", styles["Heading3"]))
        story.append(Spacer(1, 0.08 * inch))
        body = section.get("text") or section.get("body") or ""
        story.append(Paragraph(body.replace("\n", "<br/>"), styles["BodyGov"]))
        story.append(Spacer(1, 0.15 * inch))

    def _on_page(c: pdfcanvas.Canvas, d: SimpleDocTemplate) -> None:
        _draw_header_footer(c, d, brand)

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
