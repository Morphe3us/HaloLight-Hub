import { getAuthToken } from "@workspace/api-client-react";

export async function openAuthenticatedFile(url: string, fileName?: string) {
  if (!url.startsWith("/api/files/")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const token = await getAuthToken();
  const response = await fetch(url, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Unable to open file (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
