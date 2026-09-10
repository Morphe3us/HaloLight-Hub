import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { SOURCES } from "./canonical";
import { buildBundle } from "./manifest";
import { externalDirectory, ImportError, publishPrivate, readRegular, requireImport, sha256, sourceFile } from "./private-files";

const execute = promisify(execFile);
export const REVIEW_MANIFEST = "import-review-manifest.json";

export async function packSource(sourceDirectory: string, outputDirectory: string) {
  const source = await realpath(sourceDirectory);
  const bundle = await buildBundle(source);
  const output = await externalDirectory(outputDirectory, source, true);
  const temporary = await mkdtemp(path.join(output, ".source-pack-"));
  try {
    const payload = path.join(temporary, "payload");
    await mkdir(payload, { mode: 0o700 });
    // Copy only pinned files into a private snapshot; never archive the source
    // directory recursively or let tar follow source links during packaging.
    for (const item of SOURCES) {
      const bytes = await sourceFile(source, item.path);
      requireImport(bytes.length === item.bytes && sha256(bytes) === item.hash, "SOURCE_CHANGED_DURING_PACK");
      const target = path.join(payload, item.path);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await publishPrivate(target, bytes);
    }
    const review = {
      ...JSON.parse(bundle.manifest),
      files: SOURCES.map(item => ({ sourceKey: item.key, relativePath: item.path, sha256: item.hash, bytes: item.bytes })),
    };
    await publishPrivate(path.join(payload, REVIEW_MANIFEST), Buffer.from(`${JSON.stringify(review, null, 2)}\n`));
    const archive = path.join(temporary, "source.tar.gz");
    await execute("tar", ["-czf", archive, "-C", payload, "--", ...SOURCES.map(item => item.path), REVIEW_MANIFEST], {
      env: { PATH: process.env.PATH, LANG: "C", COPYFILE_DISABLE: "1" }, maxBuffer: 1024 * 1024,
    });
    const bytes = await readRegular(archive);
    const hash = sha256(bytes);
    const filename = `corrected-source-${hash}.tar.gz`;
    await publishPrivate(path.join(output, filename), bytes);
    return { filename, sha256: hash, bytes: bytes.length, sourceFiles: SOURCES.length, reviewManifests: 1 };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function main() {
  const { values } = parseArgs({ strict: true, options: { source: { type: "string" }, "output-dir": { type: "string" } } });
  requireImport(values.source && values["output-dir"], "SOURCE_AND_OUTPUT_DIRECTORY_REQUIRED");
  console.log(JSON.stringify(await packSource(values.source, values["output-dir"])));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof ImportError ? error.message : "PACK_FAILED: no sensitive details emitted");
    process.exitCode = 1;
  });
}
