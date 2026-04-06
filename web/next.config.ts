import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // Avoid picking up an unrelated lockfile higher in the home directory tree.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
