import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DeleteResult,
  PresignedUploadResult,
  PresignedUrlOptions,
  StorageProvider,
  UploadOptions,
  UploadResult,
} from "./provider";

export function getLocalStorageRoot(): string {
  return path.resolve(
    process.env.LOCAL_STORAGE_DIR ??
      path.join(process.cwd(), "storage/uploads"),
  );
}

export function getLocalStorageFilePath(key: string): string {
  return safePath(getLocalStorageRoot(), key);
}

function cleanSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cleanFolder(folder?: string): string {
  return (folder ?? "uploads")
    .split("/")
    .map(cleanSegment)
    .filter(Boolean)
    .join("/");
}

function publicPathFor(key: string): string {
  const base = process.env.LOCAL_STORAGE_PUBLIC_PATH ?? "/api/files";
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/${encodedKey}`;
}

function safePath(root: string, key: string): string {
  const resolved = path.resolve(root, key);
  const normalizedRoot = path.resolve(root);
  if (
    resolved !== normalizedRoot &&
    !resolved.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  constructor(private readonly root = getLocalStorageRoot()) {}

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const folder = cleanFolder(options.folder);
    const originalName = cleanSegment(options.filename ?? "file");
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension) || "file";
    const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${baseName}-${randomUUID()}${extension}`;
    const filePath = safePath(this.root, key);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);

    return {
      url: this.getPublicUrl(key),
      key,
      size: buffer.length,
      contentType: options.contentType,
      provider: this.name,
    };
  }

  async delete(key: string): Promise<DeleteResult> {
    await rm(safePath(this.root, key), { force: true });
    return { success: true, key };
  }

  async getPresignedUrl(
    _options: PresignedUrlOptions,
  ): Promise<PresignedUploadResult> {
    throw new Error("Local storage does not support presigned upload URLs");
  }

  getPublicUrl(key: string): string {
    return publicPathFor(key);
  }
}
