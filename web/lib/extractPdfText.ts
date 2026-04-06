import "server-only";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  const text = typeof result?.text === "string" ? result.text : "";
  return text.replace(/\u0000/g, "").trim();
}
