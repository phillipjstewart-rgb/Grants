import "server-only";

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a senior grants analyst. Read the extracted PDF text and produce a concise, accurate summary of key requirements for preparing a competitive grant proposal.
Focus on: eligibility, evaluation criteria, submission format/deadlines, mandatory attachments, cost share/matching, reporting, and any compliance or certification requirements.
If the text is incomplete or not a grant solicitation, say so briefly and summarize what is available.
Use clear headings and bullet points. Do not invent requirements not supported by the text.`,
  ],
  [
    "human",
    "Document text (may be truncated):\n\n{text}\n\nProvide the structured summary now.",
  ],
]);

export async function summarizeGrantRequirementsFromText(
  documentText: string,
  openAiApiKey: string
): Promise<string> {
  const trimmed =
    documentText.length > 120_000
      ? `${documentText.slice(0, 120_000)}\n\n[TRUNCATED FOR CONTEXT LIMIT]`
      : documentText;

  const model = new ChatOpenAI({
    apiKey: openAiApiKey,
    model: "gpt-4o-mini",
    temperature: 0.2,
  });

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  return chain.invoke({ text: trimmed });
}
