// ─── URL-Only Storage Provider ────────────────────────────────────────────────
// Current implementation: no actual file storage. Files are stored as external
// URLs pasted by admins. This provider makes the abstraction concrete while
// the real storage backend (R2 / S3) is configured.

import type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  PresignedUrlOptions,
  PresignedUploadResult,
  DeleteResult,
} from "./provider";

export class UrlOnlyProvider implements StorageProvider {
  readonly name = "url-only";

  /**
   * No-op upload — this provider does not accept file bytes.
   * Use this when the file URL has already been obtained externally.
   */
  async upload(_buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    throw new Error(
      "UrlOnlyProvider does not support direct file uploads. " +
        "Configure Cloudflare R2 or AWS S3 to enable file uploads. " +
        "Current workflow: paste an external URL into the upload form. " +
        `Attempted upload: ${options.filename ?? "unknown"}`
    );
  }

  /**
   * No-op delete — URLs are external and cannot be deleted from this provider.
   */
  async delete(key: string): Promise<DeleteResult> {
    return { success: true, key };
  }

  /**
   * Presigned URLs are not supported in URL-only mode.
   */
  async getPresignedUrl(_options: PresignedUrlOptions): Promise<PresignedUploadResult> {
    throw new Error(
      "UrlOnlyProvider does not support presigned upload URLs. " +
        "Configure a real storage provider (R2/S3) to enable this feature."
    );
  }

  getPublicUrl(key: string): string {
    // In URL-only mode, the key IS the full URL
    return key;
  }
}
