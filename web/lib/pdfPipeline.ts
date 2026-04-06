import "server-only";

import { chunkTextForEmbedding } from "@/lib/chunkText";
import { extractTextFromPdf } from "@/lib/extractPdfText";

/** Aligns with summarize route embedding cap. */
export const MAX_PDF_CHUNKS = 48;

export type PdfPipelineResult = {
  text: string;
  chunks: string[];
};

/**
 * Shared path: PDF bytes → plain text → overlapping chunks for embeddings / RAG.
 */
export async function extractPdfToChunks(buffer: Buffer): Promise<PdfPipelineResult> {
  const text = await extractTextFromPdf(buffer);
  const chunks = chunkTextForEmbedding(text).slice(0, MAX_PDF_CHUNKS);
  return { text, chunks };
}
