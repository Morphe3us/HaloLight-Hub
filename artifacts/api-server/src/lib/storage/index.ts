// ─── Storage Factory ──────────────────────────────────────────────────────────
// Auto-selects a storage provider from environment variables.
//
// Priority:
//   STORAGE_PROVIDER=filesystem -> private, externally persisted filesystem root
//   STORAGE_PROVIDER=r2   → CloudflareR2Provider  (add R2 credentials)
//   STORAGE_PROVIDER=s3   → AWSS3Provider          (add S3 credentials)
//   STORAGE_PROVIDER=supabase → SupabaseStorageProvider
//   STORAGE_PROVIDER=url  → UrlOnlyProvider        (URL-paste workflow)
//   (default in dev)      → LocalStorageProvider   (server-stored files)
//
// To migrate: implement StorageProvider for R2/S3, import below, and
// instantiate based on STORAGE_PROVIDER env var + the relevant credentials.

import type { StorageProvider } from "./provider";
import { LocalStorageProvider } from "./local-provider";
import { UrlOnlyProvider } from "./url-provider";
import { FilesystemStorageProvider } from "./filesystem-provider";
import { isExplicitDevelopment, isExplicitTest } from "../env";

export type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  PresignedUrlOptions,
  PresignedUploadResult,
  DeleteResult,
} from "./provider";

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider;

  const config = process.env.STORAGE_PROVIDER?.toLowerCase();

  if (config === "filesystem") {
    _provider = new FilesystemStorageProvider();
    return _provider;
  }

  if (!config || config === "local") {
    if (!isExplicitDevelopment() && !isExplicitTest()) {
      throw new Error(
        "Local file storage is only allowed when NODE_ENV is explicitly development or test. " +
          "Set STORAGE_PROVIDER=url for URL-only workflows, or configure a durable provider before enabling uploads.",
      );
    }
    _provider = new LocalStorageProvider();
    return _provider;
  }

  if (config === "url") {
    _provider = new UrlOnlyProvider();
    return _provider;
  }

  if (config === "r2") {
    // TODO: import and instantiate CloudflareR2Provider when credentials are available
    // const { CloudflareR2Provider } = await import("./r2-provider");
    // _provider = new CloudflareR2Provider({ accountId, accessKeyId, secretAccessKey, bucket });
    throw new Error(
      "STORAGE_PROVIDER=r2 is configured but CloudflareR2Provider is not yet implemented. " +
        "Add your R2 credentials and implement lib/storage/r2-provider.ts.",
    );
  }

  if (config === "s3") {
    // TODO: import and instantiate AWSS3Provider
    throw new Error(
      "STORAGE_PROVIDER=s3 is configured but AWSS3Provider is not yet implemented. " +
        "Add your AWS credentials and implement lib/storage/s3-provider.ts.",
    );
  }

  if (config === "supabase") {
    throw new Error(
      "STORAGE_PROVIDER=supabase is configured but SupabaseStorageProvider is not yet implemented.",
    );
  }

  throw new Error(`Unsupported STORAGE_PROVIDER value: ${config}`);
}

export function resetStorageProvider(): void {
  _provider = null;
}
