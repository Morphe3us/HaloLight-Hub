import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { decodeTicketAttachments, publicTicketAttachments, removeTicketAttachments, saveTicketAttachments } from "./supportAttachments";
import { FilesystemStorageProvider } from "./storage/filesystem-provider";

const bytes = Buffer.from("%PDF-1.4\nSynthetic test fixture, not an original document.\n%%EOF");
const input = { fileName: "fixture.pdf", mimeType: "application/pdf", data: bytes.toString("base64") };

test("attachment validation rejects traversal, active content, malformed base64, mismatched types and limits", () => {
  assert.deepEqual(decodeTicketAttachments([input])[0]!.buffer, bytes);
  for (const bad of [null, {}, [input, input, input, input], [{ ...input, fileName: "../fixture.pdf" }], [{ ...input, fileName: "bad\n.pdf" }],
    [{ ...input, data: input.data + " " }], [{ ...input, data: "a===" }], [{ ...input, mimeType: "image/png" }],
    [{ ...input, mimeType: "video/mp4" }], [{ ...input, data: Buffer.from("%PDF-<script>bad</script>").toString("base64") }]]) assert.throws(() => decodeTicketAttachments(bad));
  const large = Buffer.alloc(6 * 1024 * 1024, 32); bytes.copy(large);
  const largeInput = { ...input, data: large.toString("base64") };
  assert.equal(decodeTicketAttachments([largeInput])[0]!.buffer.length, large.length);
  assert.throws(() => decodeTicketAttachments([largeInput, largeInput]), /10 MiB/);
});

test("private filesystem stores synthetic PDF byte-identically, public metadata never exposes storage key", async t => {
  const base = path.join(homedir(), ".HaloHub"); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "ticket-attachment-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new FilesystemStorageProvider(root);
  const saved = await saveTicketAttachments("fixture-ticket", decodeTicketAttachments([input]), storage);
  const stream = await storage.openReadStream(saved[0]!.key);
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), bytes);
  const metadata = publicTicketAttachments("fixture-ticket", saved);
  assert.ok(!("key" in metadata[0]!)); assert.ok(!("data" in metadata[0]!));
  assert.match(metadata[0]!.downloadUrl, /^\/api\/support\/tickets\/fixture-ticket\/attachments\//);
  await removeTicketAttachments(saved, storage);
  await assert.rejects(storage.openReadStream(saved[0]!.key));
});
