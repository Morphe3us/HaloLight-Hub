import { constants } from "node:fs";
import { access, chmod, link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

export class ImportError extends Error {}
export function requireImport(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ImportError(code);
}
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const within = (parent: string, child: string) => child === parent || child.startsWith(`${parent}${path.sep}`);

export async function readRegular(file: string): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    requireImport(info.isFile(), "NOT_REGULAR_FILE");
    requireImport(info.nlink === 1, "PRIVATE_FILE_MULTIPLE_LINKS");
    return await handle.readFile();
  } finally { await handle.close(); }
}

export async function sourceFile(root: string, relative: string): Promise<Buffer> {
  requireImport(!path.isAbsolute(relative) && !relative.split("/").includes(".."), "INVALID_SOURCE_KEY");
  const file = path.join(root, relative);
  requireImport(within(root, await realpath(file)), "SOURCE_ESCAPE");
  return readRegular(file);
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function prospectivePath(input: string): Promise<string> {
  try { return await realpath(input); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(input);
    requireImport(parent !== input, "INVALID_PRIVATE_DIRECTORY");
    return path.join(await prospectivePath(parent), path.basename(input));
  }
}

export interface DirectoryContext { applicationCwd?: string; frontendDistPath?: string }
async function validateDirectory(input: string, source: string, context: DirectoryContext): Promise<string> {
  requireImport(path.isAbsolute(input) && !input.includes("\0"), "PRIVATE_DIRECTORY_MUST_BE_ABSOLUTE");
  const requested = path.resolve(input);
  try { requireImport(!(await lstat(requested)).isSymbolicLink(), "PRIVATE_ROOT_SYMLINK"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const cwd = context.applicationCwd ?? process.cwd();
  const releaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const excluded = [cwd, releaseRoot, path.resolve(releaseRoot, context.frontendDistPath ?? process.env.FRONTEND_DIST_PATH ?? "artifacts/halolight-os/dist/public"), path.join(cwd, "public")];
  const canonical = await prospectivePath(requested);
  for (const excludedRoot of excluded) {
    const resolved = await prospectivePath(path.resolve(excludedRoot));
    requireImport(!within(excludedRoot, requested) && !within(requested, excludedRoot) && !within(resolved, canonical) && !within(canonical, resolved), "PRIVATE_DIRECTORY_IN_APPLICATION_OR_PUBLIC_ROOT");
  }
  requireImport(!within(source, canonical) && !within(canonical, source), "PRIVATE_SOURCE_OVERLAP");
  let parent = canonical;
  for (;;) {
    requireImport(!(await exists(path.join(parent, ".git"))), "PRIVATE_DIRECTORY_IN_GIT");
    if (parent === path.dirname(parent)) break;
    parent = path.dirname(parent);
  }
  return canonical;
}

// Apply and staging share runtime exclusions, including non-Git release roots.
export async function externalDirectory(input: string, source: string, create = false, context: DirectoryContext = {}): Promise<string> {
  const canonical = await validateDirectory(input, source, context);
  if (create) await mkdir(input, { recursive: true, mode: 0o700 });
  const info = await lstat(input);
  requireImport(info.isDirectory() && !info.isSymbolicLink(), "PRIVATE_DIRECTORY_REQUIRED");
  requireImport(await realpath(input) === canonical, "PRIVATE_DIRECTORY_CHANGED");
  requireImport(((await lstat(canonical)).mode & 0o077) === 0, "PRIVATE_DIRECTORY_PERMISSIONS");
  return canonical;
}

export async function validateApplyStorage(input: string, source: string, staging: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  requireImport(env.STORAGE_PROVIDER?.toLowerCase() === "filesystem", "FILESYSTEM_STORAGE_PROVIDER_REQUIRED");
  requireImport(env.PRIVATE_STORAGE_DIR && path.isAbsolute(env.PRIVATE_STORAGE_DIR), "PRIVATE_STORAGE_DIR_REQUIRED");
  const context = { frontendDistPath: env.FRONTEND_DIST_PATH };
  const configured = await validateDirectory(env.PRIVATE_STORAGE_DIR, source, context);
  const requested = await validateDirectory(input, source, context);
  requireImport(configured === requested, "PRIVATE_STORAGE_DIR_MISMATCH");
  requireImport(!within(staging, requested) && !within(requested, staging), "STORAGE_STAGING_OVERLAP");
  return requested;
}

export async function ensurePrivateChild(root: string, child: string, create: boolean): Promise<string> {
  requireImport(/^[a-z0-9-]+$/.test(child), "INVALID_STORAGE_PREFIX");
  const dir = path.join(root, child);
  if (create) await mkdir(dir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const stat = await lstat(dir);
  requireImport(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, "UNSAFE_STORAGE_DIRECTORY");
  return dir;
}

// Hard-link publication is atomic and refuses to replace any existing target.
export async function publishPrivate(file: string, bytes: Buffer): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally { await handle.close(); }
    try { await link(temporary, file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      requireImport(sha256(await readRegular(file)) === sha256(bytes), "STAGED_FILE_CONFLICT");
      requireImport(((await lstat(file)).mode & 0o077) === 0, "PRIVATE_FILE_PERMISSIONS");
    }
    await chmod(file, 0o600);
  } finally { await unlink(temporary); }
  // A previous interruption may have left another link. Never register a file
  // the runtime cannot serve; do not guess whether an unknown alias is ours.
  requireImport((await lstat(file)).nlink === 1, "PRIVATE_FILE_MULTIPLE_LINKS");
}
