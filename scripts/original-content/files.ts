import path from "node:path";
import os from "node:os";
import { lstat, realpath } from "node:fs/promises";
import { PINS, ORIGINAL_PREFIX, CORRECTED_PREFIX, NAMESPACE } from "./pins";
import { externalDirectory, ensurePrivateChild, publishPrivate, readRegular, requireImport, sha256 } from "../content/private-files";

export interface OriginalPair {
  key: string;
  sourceKey: string;
  originalPath: string;
  originalHash: string;
  originalBytes: number;
  correctedPath: string;
  correctedHash: string;
  correctedBytes: number;
  oldFileUrl: string;
  newFileUrl: string;
}
export interface VerifiedPair extends OriginalPair { bytes: Buffer }
export const marker = (sourceKey: string) => `[sourceKey=${sourceKey}]`;
export const sourceKeyFrom = (description: unknown): string | null => {
  if (typeof description !== "string" || description.split("[sourceKey=").length !== 2) return null;
  return /^\[sourceKey=(halolight:corrected-content:fr:[a-z0-9-]+)\](?:\s|$)/.exec(description)?.[1] ?? null;
};

export async function privateWorkPath(input: string): Promise<string> {
  const work = await realpath(path.join(os.homedir(), ".HaloHub"));
  const requested = path.resolve(input);
  const parent = await realpath(path.dirname(requested));
  requireImport(parent === work || parent.startsWith(`${work}${path.sep}`), "WORKFILE_OUTSIDE_PRIVATE_ROOT");
  for (const name of ["Halolight-hub", "Halolight-hub-corrige"]) {
    const source = path.join(work, name);
    requireImport(parent !== source && !parent.startsWith(`${source}${path.sep}`), "WORKFILE_INSIDE_SOURCE");
  }
  try { requireImport(!(await lstat(requested)).isSymbolicLink(), "WORKFILE_SYMLINK"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return path.join(parent, path.basename(requested));
}

async function sourceBytes(root: string, key: string): Promise<Buffer> {
  requireImport(typeof key === "string" && !path.isAbsolute(key) && !/[\\\0]/.test(key) &&
    key.split("/").every(part => part && part !== "." && part !== ".."), "INVALID_ORIGINAL_PATH");
  const canonical = await realpath(root);
  let current = canonical;
  for (const part of key.split("/")) {
    current = path.join(current, part);
    requireImport(!(await lstat(current)).isSymbolicLink(), "SOURCE_SYMLINK");
  }
  requireImport((await realpath(current)).startsWith(`${canonical}${path.sep}`), "SOURCE_ESCAPE");
  return readRegular(current);
}

export async function verifyOriginals(mapFile: string, originalRoot: string, correctedRoot: string): Promise<VerifiedPair[]> {
  const mapping = JSON.parse((await readRegular(mapFile)).toString("utf8")) as { pairs?: OriginalPair[] };
  requireImport(Array.isArray(mapping.pairs) && mapping.pairs.length === PINS.length, "EXACT_15_MAPPING_REQUIRED");
  requireImport(new Set(mapping.pairs.map(p => p.key)).size === PINS.length, "DUPLICATE_MAPPING");
  const verified: VerifiedPair[] = [];
  for (const pin of PINS) {
    const p = mapping.pairs.find(pair => pair.key === pin.key);
    requireImport(p && p.originalHash === pin.originalHash && p.originalBytes === pin.originalBytes &&
      p.correctedHash === pin.correctedHash && p.correctedBytes === pin.correctedBytes &&
      p.sourceKey === `${NAMESPACE}:${pin.key}` &&
      p.oldFileUrl === `/api/files/${CORRECTED_PREFIX}/${pin.correctedHash}.pdf` &&
      p.newFileUrl === `/api/files/${ORIGINAL_PREFIX}/${pin.originalHash}.pdf`, "PIN_MISMATCH");
    const bytes = await sourceBytes(originalRoot, p.originalPath);
    const corrected = await sourceBytes(correctedRoot, p.correctedPath);
    requireImport(bytes.length === pin.originalBytes && sha256(bytes) === pin.originalHash &&
      bytes.subarray(0, 5).toString("ascii") === "%PDF-", "ORIGINAL_BYTES_CHANGED");
    requireImport(corrected.length === pin.correctedBytes && sha256(corrected) === pin.correctedHash, "CORRECTED_BYTES_CHANGED");
    verified.push({ ...p, bytes });
  }
  return verified;
}

export async function publishOriginals(pairs: VerifiedPair[], root: string, originalRoot: string, correctedRoot: string): Promise<void> {
  await privateWorkPath(path.join(root, "sentinel"));
  const storage = await externalDirectory(root, await realpath(originalRoot), false);
  const corrected = await realpath(correctedRoot);
  requireImport(storage !== corrected && !storage.startsWith(`${corrected}${path.sep}`) &&
    !corrected.startsWith(`${storage}${path.sep}`), "STORAGE_CORRECTED_OVERLAP");
  const directory = await ensurePrivateChild(storage, ORIGINAL_PREFIX, true);
  for (const p of pairs) {
    requireImport(sha256(p.bytes) === p.originalHash && p.bytes.length === p.originalBytes, "ORIGINAL_BYTES_CHANGED");
    const filename = path.join(directory, `${p.originalHash}.pdf`);
    await publishPrivate(filename, p.bytes);
    requireImport((await readRegular(filename)).equals(p.bytes), "RESTORED_BYTES_CHANGED");
  }
}
