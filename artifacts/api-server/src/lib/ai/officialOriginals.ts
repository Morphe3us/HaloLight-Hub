import { createHash } from "node:crypto";
import { redactSensitiveText } from "./supportPolicy";

// User-authorized original corpus, extracted by the hash-verifying PDF tool.
// Pin the complete derivative as well as its embedded original hashes: a forged
// upload cannot gain approval by copying a sourceKey or PDF hash.
export const OFFICIAL_INDEX_SHA256 =
  "7fa596cfe8174e75ea45ab54e3c93de50ad259e57883996b0c2944bdd90b4cd7";
export const OFFICIAL_INDEX_REVISION = `original-text-v1:${OFFICIAL_INDEX_SHA256}`;
export interface OfficialOriginal {
  sourceKey: string;
  originalSha256: string;
  fileUrl: string;
  pages: Array<{ page: number; text: string }>;
  emptyPages: number[];
}

export function readOfficialIndex(bytes: Buffer): OfficialOriginal[] {
  if (
    createHash("sha256").update(bytes).digest("hex") !== OFFICIAL_INDEX_SHA256
  )
    throw new Error("OFFICIAL_INDEX_HASH_MISMATCH");
  const index = JSON.parse(bytes.toString("utf8"));
  if (
    index.version !== 1 ||
    index.kind !== "original-pdf-page-text" ||
    index.pdfMutation !== false ||
    index.privateDerivativeOnly !== true ||
    index.documents.length !== 15
  )
    throw new Error("INVALID_OFFICIAL_INDEX");
  const documents = index.documents as OfficialOriginal[];
  for (const doc of documents) {
    if (
      !/^halolight:corrected-content:fr:[a-z0-9-]+$/.test(doc.sourceKey) ||
      !/^[a-f0-9]{64}$/.test(doc.originalSha256) ||
      doc.fileUrl !==
        `/api/files/original-2026-09-10/${doc.originalSha256}.pdf` ||
      !doc.pages.length ||
      doc.pages.some((p, i) => p.page !== i + 1 || typeof p.text !== "string")
    )
      throw new Error("INVALID_OFFICIAL_DOCUMENT");
  }
  return documents;
}

export function officialContent(doc: OfficialOriginal) {
  const pages = doc.pages
    .filter((p) => p.text.trim())
    .map((p) => ({
      page: p.page,
      content: `## Page ${p.page}\n\n${redactSensitiveText(p.text)}`,
    }));
  return {
    content: `[PDF original](${doc.fileUrl})\n\n${pages.map((p) => p.content).join("\n\n")}`,
    pages,
  };
}
