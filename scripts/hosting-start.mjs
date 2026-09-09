import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvFile } from "node:process";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
try {
  loadEnvFile(path.join(root, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.env.NODE_ENV = "production";

const frontendPath = path.resolve(
  root,
  process.env.FRONTEND_DIST_PATH || "artifacts/halolight-os/dist/public",
);
const apiBundle = new URL("../artifacts/api-server/dist/index.mjs", import.meta.url);

try {
  await access(path.join(frontendPath, "index.html"), constants.R_OK);
  await access(apiBundle, constants.R_OK);
} catch {
  console.error(
    "Hosting start aborted: frontend index.html or API bundle is missing/unreadable. Run bash scripts/hosting-build.sh successfully first and check FRONTEND_DIST_PATH.",
  );
  process.exit(1);
}

// Import only after production mode and the repository working directory are set.
await import(apiBundle.href);
