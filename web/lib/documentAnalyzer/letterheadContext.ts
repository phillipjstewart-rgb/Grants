import "server-only";

import { readFile } from "fs/promises";
import path from "path";

/** Load brand + optional DNA snippet for “company letterhead” drafting. */
export async function loadLetterheadContext(): Promise<string> {
  const root = path.resolve(process.cwd(), "..");
  const brandPath = path.join(root, "data", "brand_config.json");
  let brand = "{}";
  try {
    brand = await readFile(brandPath, "utf-8");
  } catch {
    /* optional in minimal checkouts */
  }
  let dna = "";
  const dnaPath = path.join(root, "data", "Company_DNA.md");
  try {
    const full = await readFile(dnaPath, "utf-8");
    dna = full.length > 4000 ? `${full.slice(0, 4000)}…` : full;
  } catch {
    /* optional */
  }
  return `Company brand JSON (letterhead / identity):\n${brand}\n\nCompany DNA (excerpt):\n${dna || "(not available)"}`;
}
