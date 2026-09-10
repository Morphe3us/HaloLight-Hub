import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { kbLinkTarget } from "@/lib/kbLinks";
import { fetchKbFile } from "@/lib/kbDownload";

function KBLink({ href, children }: { href?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const target = kbLinkTarget(href ?? "", window.location.origin);
  if (!target) return <span>{children}</span>;
  if (!target.authenticated) return <a href={target.href} rel="noopener noreferrer">{children}</a>;
  const download = async () => {
    setBusy(true); setFailed(false);
    try {
      const blob = await fetchKbFile(target.href, window.location.origin);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = decodeURIComponent(target.href.split("/").pop() || "document.pdf");
      document.body.appendChild(link);
      link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <span>
    <button type="button" className="inline-flex items-center gap-1 text-primary underline text-left break-words disabled:opacity-50"
      disabled={busy} onClick={() => void download()}>
      <Download className="w-4 h-4 shrink-0" />{busy ? t("kb.downloading", { defaultValue: "Downloading…" }) : children}
    </button>
    {failed && <span role="alert" className="block text-sm text-destructive">{t("kb.download_error", { defaultValue: "Download failed. Please try again." })}</span>}
  </span>;
}

export function KBMarkdown({ content }: { content: string }) {
  return <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto">
    <Markdown skipHtml remarkPlugins={[remarkGfm]} components={{
      a: ({ href, children }) => <KBLink href={href}>{children}</KBLink>,
      img: ({ alt }) => <span>{alt}</span>,
    }}>{content}</Markdown>
  </div>;
}
