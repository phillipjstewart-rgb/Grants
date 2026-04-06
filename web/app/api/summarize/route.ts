import { NextResponse } from "next/server";
import { z } from "zod";

import { extractTextFromPdf } from "@/lib/extractPdfText";
import { summarizeGrantRequirementsFromText } from "@/lib/summarizeGrantRequirements";
import { getSupabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
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

  if (!text || text.length < 40) {
    return NextResponse.json(
      {
        error:
          "Very little text was extracted. Try a text-based PDF or OCR the document first.",
      },
      { status: 422 }
    );
  }

  try {
    const summary = await summarizeGrantRequirementsFromText(text, key);

    const admin = getSupabaseAdmin();
    if (admin) {
      const { error: dbError } = await admin.from("pdf_analyses").insert({
        filename: upload.name,
        extracted_chars: text.length,
        summary,
      });
      if (dbError) {
        console.error("[supabase] pdf_analyses insert failed:", dbError.message);
      }
    }

    return NextResponse.json({
      filename: upload.name,
      extractedChars: text.length,
      summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Summarization failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
