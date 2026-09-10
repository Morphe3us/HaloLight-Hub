import { randomUUID } from "node:crypto";
import path from "node:path";
import { FilesystemStorageProvider } from "./storage/filesystem-provider";
import type { StorageProvider } from "./storage/provider";
import { validateUploadedFile } from "./uploadSecurity";

export type TicketAttachment = { id: string; key: string; fileName: string; mimeType: string; size: number };
export const MAX_TICKET_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function ticketAttachmentStorage(): StorageProvider {
  const root = process.env.PRIVATE_STORAGE_DIR;
  if (!root || !path.isAbsolute(root)) throw new Error("Attachment storage is not configured");
  return new FilesystemStorageProvider(path.join(root, "support-private"));
}

export function decodeTicketAttachments(input: unknown) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 3) throw new Error("At most 3 attachments are allowed");
  let total = 0;
  return input.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid attachment");
    const { fileName, mimeType, data } = item as Record<string, unknown>;
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 180 || /[\\/\x00-\x1f\x7f]/.test(fileName)
      || typeof mimeType !== "string" || !allowed.has(mimeType) || typeof data !== "string"
      || !data.length || data.length > Math.ceil(MAX_TICKET_ATTACHMENT_BYTES / 3) * 4
      || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new Error("Invalid attachment name, type or base64 data");
    }
    const buffer = Buffer.from(data, "base64");
    total += buffer.length;
    if (total > MAX_TICKET_ATTACHMENT_BYTES) throw new Error("Attachments exceed 10 MiB total");
    if (buffer.toString("base64") !== data) throw new Error("Invalid base64 data");
    const validation = validateUploadedFile({ fileName, mimeType, buffer });
    if (!validation.ok) throw new Error(validation.error);
    return { fileName, mimeType, buffer };
  });
}

export async function saveTicketAttachments(ticketId: string, files: ReturnType<typeof decodeTicketAttachments>, storage: StorageProvider) {
  const saved: TicketAttachment[] = [];
  try {
    for (const file of files) {
      const uploaded = await storage.upload(file.buffer, { filename: file.fileName, contentType: file.mimeType, folder: ticketId, isPublic: false });
      saved.push({ id: randomUUID(), key: uploaded.key, fileName: file.fileName, mimeType: file.mimeType, size: file.buffer.length });
    }
    return saved;
  } catch (error) {
    await removeTicketAttachments(saved, storage);
    throw error;
  }
}

export async function removeTicketAttachments(files: TicketAttachment[], storage: StorageProvider) {
  for (const file of files) await storage.delete(file.key).catch(() => undefined);
}

export function publicTicketAttachments(ticketId: string, files: TicketAttachment[]) {
  return files.map(({ key: _key, ...file }) => ({ ...file, downloadUrl: `/api/support/tickets/${ticketId}/attachments/${file.id}` }));
}
