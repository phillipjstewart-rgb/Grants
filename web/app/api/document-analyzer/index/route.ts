import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { saveAnalyzerIndex } from "@/lib/documentAnalyzer/sessionStore";
import { extractTextFromPdf } from "@/lib/extractPdfText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  const parsed = z.instanceof(File).safeParse(file);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected a PDF file under the field name \"file\"." },
      { status: 400 }
    );
  }

  const upload = parsed.data;
  if (upload.size === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (upload.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB).` },
      { status: 400 }
    );
  }

  const type = (upload.type || "").toLowerCase();
  const name = (upload.name || "").toLowerCase();
  if (!type.includes("pdf") && !name.endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF uploads are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  let text: string;
  try {
    text = await extractTextFromPdf(buffer);
  } catch {
    return NextResponse.json(
      { error: "Could not parse PDF text. The file may be scanned or encrypted." },
      { status: 422 }
    );
  }

  if (!text || text.length < 20) {
    return NextResponse.json(
      { error: "Very little text was extracted. Try a text-based PDF." },
      { status: 422 }
    );
  }

  try {
    const { Document, VectorStoreIndex, Settings } = await import("llamaindex");
    const { OpenAI, OpenAIEmbedding } = await import("@llamaindex/openai");

    const llm = new OpenAI({
      apiKey,
      model: "gpt-4o-mini",
      temperature: 0.2,
    });
    const embedModel = new OpenAIEmbedding({
      apiKey,
      model: "text-embedding-3-small",
    });

    const doc = new Document({
      text,
      metadata: { filename: upload.name, source: "document-analyzer" },
    });

    const vectorIndex = await Settings.withLLM(llm, () =>
      Settings.withEmbedModel(embedModel, async () => {
        return VectorStoreIndex.fromDocuments([doc]);
      })
    );

    const sessionId = randomUUID();
    saveAnalyzerIndex(sessionId, vectorIndex, upload.name);

    return NextResponse.json({
      sessionId,
      filename: upload.name,
      charCount: text.length,
    });
  } catch (e) {
    console.error("[document-analyzer/index]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to build LlamaIndex vector index.", detail: message },
      { status: 500 }
    );
  }
}
