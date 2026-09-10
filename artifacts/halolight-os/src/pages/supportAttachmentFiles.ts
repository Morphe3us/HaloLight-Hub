import { customFetch, type SupportAttachmentInput } from "@workspace/api-client-react";

function isAttachmentMime(value: string): value is SupportAttachmentInput["mimeType"] {
  return ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(value);
}

export async function encodeSupportFiles(files: File[]) {
  if (files.length > 3 || files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024 ||
    files.some(file => !isAttachmentMime(file.type))) {
    throw new Error("Invalid attachments");
  }
  const result: SupportAttachmentInput[] = [];
  for (const file of files) {
    const mimeType = file.type;
    if (!isAttachmentMime(mimeType)) throw new Error("Invalid attachment type");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("File read failed"));
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
    result.push({ fileName: file.name, mimeType, data });
  }
  return result;
}

export async function downloadSupportAttachment(ticketId: string, attachmentId: string, fileName: string) {
  const blob = await customFetch<Blob>(`/api/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}`, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = fileName; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
