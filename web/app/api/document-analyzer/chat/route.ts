import { NextResponse } from "next/server";
import { z } from "zod";

import { loadLetterheadContext } from "@/lib/documentAnalyzer/letterheadContext";
import { getAnalyzerIndex, touchSession } from "@/lib/documentAnalyzer/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sessionId: z.string().uuid(),
    message: z.string().max(12_000).optional().default(""),
    quickAction: z.enum(["about", "requirements", "draft_letter"]).optional(),
    /** Optional prior turns for context (client-managed). */
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(8000),
        })
      )
      .max(24)
      .optional(),
  })
  .refine((d) => d.quickAction != null || d.message.trim().length > 0, {
    message: "Provide message text or a quickAction.",
  });

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { sessionId, message, history, quickAction } = parsed.data;
  const index = getAnalyzerIndex(sessionId);
  if (!index) {
    return NextResponse.json(
      { error: "Session expired or unknown. Upload the PDF again." },
      { status: 404 }
    );
  }

  touchSession(sessionId);

  let actionPreamble = "";
  if (quickAction === "about") {
    actionPreamble =
      "Task: Explain what this document is about. Cover purpose, audience, program or opportunity type, and major themes. Use only evidence from the retrieved document context.\n\n";
  } else if (quickAction === "requirements") {
    actionPreamble =
      "Task: List the key requirements: eligibility, submission deadlines, formatting, mandatory attachments, evaluation criteria, cost share, and compliance. Use bullet points. Use only evidence from the retrieved document context.\n\n";
  } else if (quickAction === "draft_letter") {
    const letterCtx = await loadLetterheadContext();
    actionPreamble = `Task: Draft a formal response letter (Markdown) appropriate for a government grant or procurement context. Apply the company letterhead / identity details below. Address the opportunity implied by the document. Do not invent facts not supported by the document or company materials.\n\n${letterCtx}\n\n`;
  }

  const historyBlock =
    history && history.length > 0
      ? `Prior conversation (most recent last):\n${history
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n")}\n\n`
      : "";

  const userLine = message.trim() ? `User question or notes:\n${message.trim()}` : "Proceed with the task above.";
  const queryText = `${actionPreamble}${historyBlock}${userLine}`;

  try {
    const { Settings } = await import("llamaindex");
    const { OpenAI, OpenAIEmbedding } = await import("@llamaindex/openai");

    const llm = new OpenAI({
      apiKey,
      model: "gpt-4o-mini",
      temperature: 0.25,
    });
    const embedModel = new OpenAIEmbedding({
      apiKey,
      model: "text-embedding-3-small",
    });

    const reply = await Settings.withLLM(llm, () =>
      Settings.withEmbedModel(embedModel, async () => {
        const engine = index.asQueryEngine({ similarityTopK: 8 });
        const res = await engine.query({ query: queryText });
        return res.toString();
      })
    );

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[document-analyzer/chat]", e);
    const messageText = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Chat query failed.", detail: messageText },
      { status: 500 }
    );
  }
}
