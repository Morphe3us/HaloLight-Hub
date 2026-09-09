// ─── Storage Provider Interface ───────────────────────────────────────────────
// Abstraction layer for file storage. Swap in Cloudflare R2, AWS S3, or
// Supabase Storage by implementing this interface and updating the factory.

export interface UploadOptions {
  contentType?: string;
  filename?: string;
  folder?: string;
  isPublic?: boolean;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  /**
   * Application-facing URL. For protected files this must route through the API
   * authorization layer, for example /api/files/<key>, not a raw public bucket URL.
   */
  url: string;
  key: string;
  size?: number;
  contentType?: string;
  provider: string;
}

export interface PresignedUrlOptions {
  key: string;
  expiresInSeconds?: number;
  contentType?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresAt: Date;
}

export interface DeleteResult {
  success: boolean;
  key: string;
}

/**
 * StorageProvider — implement this interface to add any file storage backend.
 *
 * Minimal implementation requires:
 *  - upload()         Upload a buffer/stream and return a public URL
 *  - delete()         Remove a stored file
 *  - getPresignedUrl() Generate a time-limited upload URL for direct browser uploads
 *
 * Future providers:
 *  - CloudflareR2Provider  (implements R2 SDK)
 *  - AWSS3Provider         (implements aws-sdk v3)
 *  - SupabaseStorageProvider (implements @supabase/storage-js)
 */
export interface StorageProvider {
  readonly name: string;

  /**
   * Upload a file buffer and return the result with a public URL.
   */
  upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult>;

  /**
   * Delete a file by its storage key.
   */
  delete(key: string): Promise<DeleteResult>;

  /**
   * Generate a presigned URL for direct browser-to-storage uploads.
   * Returns both the upload URL (PUT target) and the final public URL.
   */
  getPresignedUrl(options: PresignedUrlOptions): Promise<PresignedUploadResult>;

  /**
   * Derive the public URL for a given storage key.
   */
  getPublicUrl(key: string): string;
}
