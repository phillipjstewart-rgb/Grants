/** Retrieved evidence returned with document-analyzer chat replies. */
export type AnalyzerChatSource = {
  kind: "llamaindex" | "pgvector";
  excerpt: string;
  /** Cosine-style score from pgvector, or retriever score from LlamaIndex when present. */
  score?: number;
  chunkIndex?: number;
};
