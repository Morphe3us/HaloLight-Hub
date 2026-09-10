import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { createStorageKey } from "./local-provider";
import type {
  PresignedUrlOptions,
  StorageProvider,
  UploadOptions,
} from "./provider";

const unavailable = () => new Error("Private file storage is unavailable");

function contains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function validateKey(key: string): string[] {
  const segments = key.split("/");
  if (
    !key ||
    path.isAbsolute(key) ||
    /[\\\x00-\x1f\x7f%]/.test(key) ||
    segments.some((part) => !part || part === "." || part === "..")
  ) {
    throw unavailable();
  }
  return segments;
}

// Resolve existing ancestors too: a missing directory below a symlink must not
// bypass the exclusion of the application or public web roots.
async function resolveProspectivePath(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(target);
    if (parent === target) throw unavailable();
    return path.join(
      await resolveProspectivePath(parent),
      path.basename(target),
    );
  }
}

export class FilesystemStorageProvider implements StorageProvider {
  readonly name = "filesystem";
  private readonly root: string;
  private readonly excludedRoots: string[];

  constructor(root = process.env.PRIVATE_STORAGE_DIR) {
    if (!root || !path.isAbsolute(root) || root.includes("\0"))
      throw unavailable();
    this.root = path.resolve(root);
    this.excludedRoots = [
      process.cwd(),
      path.resolve(
        process.env.FRONTEND_DIST_PATH || "artifacts/halolight-os/dist/public",
      ),
    ];
    this.checkOutside(this.root, this.excludedRoots);
  }

  private checkOutside(root: string, excluded: string[]): void {
    if (
      excluded.some((other) => contains(other, root) || contains(root, other))
    ) {
      throw unavailable();
    }
  }

  private async storageRoot(create: boolean): Promise<string> {
    const canonical = await resolveProspectivePath(this.root);
    const excluded = await Promise.all(
      this.excludedRoots.map(resolveProspectivePath),
    );
    this.checkOutside(canonical, excluded);
    if (create) await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (info.isSymbolicLink() || !info.isDirectory()) throw unavailable();
    const resolved = await realpath(this.root);
    if (resolved !== canonical) throw unavailable();
    this.checkOutside(resolved, excluded);
    if (create) await chmod(resolved, 0o700);
    return resolved;
  }

  private async filePath(key: string, create: boolean): Promise<string> {
    const segments = validateKey(key);
    const root = await this.storageRoot(create);
    let directory = root;
    for (const segment of segments.slice(0, -1)) {
      directory = path.join(directory, segment);
      if (create) {
        try {
          await mkdir(directory, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      const info = await lstat(directory);
      if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        (await realpath(directory)) !== directory ||
        !contains(root, directory)
      ) {
        throw unavailable();
      }
      if (create) await chmod(directory, 0o700);
    }
    return path.join(directory, segments[segments.length - 1]!);
  }

  async upload(buffer: Buffer, options: UploadOptions) {
    try {
      const key = createStorageKey(options);
      const target = await this.filePath(key, true);
      const file = await open(
        target,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        if (
          (await this.filePath(key, false)) !== target ||
          (await realpath(target)) !== target
        ) {
          throw unavailable();
        }
        await file.chmod(0o600);
        await file.writeFile(buffer);
        await file.sync();
      } finally {
        await file.close();
      }
      return {
        url: this.getPublicUrl(key),
        key,
        size: buffer.length,
        contentType: options.contentType,
        provider: this.name,
      };
    } catch {
      throw unavailable();
    }
  }

  async openReadStream(key: string) {
    try {
      const target = await this.filePath(key, false);
      const info = await lstat(target);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink !== 1 ||
        (await realpath(target)) !== target
      )
        throw unavailable();
      const file = await open(
        target,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const opened = await file.stat();
        if (
          !opened.isFile() ||
          opened.ino !== info.ino ||
          opened.dev !== info.dev ||
          opened.nlink !== 1 ||
          (await this.filePath(key, false)) !== target ||
          (await realpath(target)) !== target
        )
          throw unavailable();
        return file.createReadStream();
      } catch (error) {
        await file.close();
        throw error;
      }
    } catch {
      throw unavailable();
    }
  }

  async delete(key: string) {
    try {
      const target = await this.filePath(key, false);
      const info = await lstat(target);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        (await realpath(target)) !== target
      ) {
        throw unavailable();
      }
      await unlink(target);
      return { success: true, key };
    } catch {
      throw unavailable();
    }
  }

  async getPresignedUrl(_options: PresignedUrlOptions): Promise<never> {
    throw new Error("Private file storage does not support presigned uploads");
  }

  getPublicUrl(key: string): string {
    validateKey(key);
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
