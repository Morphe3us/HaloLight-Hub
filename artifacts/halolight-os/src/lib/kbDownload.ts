import { customFetch } from "@workspace/api-client-react";
import { kbLinkTarget } from "./kbLinks";

export async function fetchKbFile(href: string, origin: string): Promise<Blob> {
  const target = kbLinkTarget(href, origin);
  if (!target?.authenticated) throw new Error("Invalid KB file link");
  return customFetch<Blob>(target.href, { responseType: "blob", credentials: "include", redirect: "error" });
}
