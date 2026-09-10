import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "../../lib/db/src/schema/index";

// Load the actual runtime retrieval code with only its database connection
// substituted. Queries and eligibility/citation policy remain unchanged.
export function localRetrieval(db: unknown) {
  const filename = fileURLToPath(new URL("../../artifacts/api-server/src/lib/ai/rag.ts", import.meta.url));
  const require = createRequire(filename);
  const { transformSync } = require("esbuild");
  const code = transformSync(readFileSync(filename, "utf8"), { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} as { retrieveContext: (query: string, language: string) => Promise<{ sources: Array<{ id: string; type: string; url?: string; meta?: Record<string, string> }> }> } };
  new Function("require", "module", "exports", code)(
    (id: string) => id === "@workspace/db" ? { ...schema, db } : require(id), module, module.exports,
  );
  return module.exports.retrieveContext;
}
