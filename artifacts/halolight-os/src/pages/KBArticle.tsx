import { Link, useParams } from "wouter";
import { useGetKbArticle } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Eye, Clock, FileText, ChevronRight } from "lucide-react";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-xl font-semibold text-gray-900 mt-6 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl font-bold text-gray-900 mt-6 mb-3">{line.slice(2)}</h1>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-lg font-semibold text-gray-800 mt-4 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i]!.startsWith("- ") || lines[i]!.startsWith("* "))) {
        items.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-3 text-gray-700">
          {items.map((item, idx) => <li key={idx}>{item}</li>)}
        </ul>
      );
      continue;
    } else if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.match(/^\d+\. /)) {
        items.push(lines[i]!.replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-3 text-gray-700">
          {items.map((item, idx) => <li key={idx}>{item}</li>)}
        </ol>
      );
      continue;
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-primary/40 pl-4 py-1 my-3 bg-blue-50 rounded-r-lg text-gray-700 italic">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line === "---" || line === "***") {
      elements.push(<hr key={i} className="my-4 border-gray-200" />);
    } else if (line === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-gray-700 leading-relaxed my-1">{line}</p>);
    }
    i++;
  }
  return elements;
}

export default function KBArticle() {
  const { id } = useParams<{ id: string }>();
  const { data: article, isLoading } = useGetKbArticle(id!);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-6 w-3/4 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Article not found.</p>
        <Link href="/kb"><Button variant="outline" className="mt-4">Back to Knowledge Base</Button></Link>
      </div>
    );
  }

  const related = (article as unknown as { related?: Array<{ id: string; title: string; excerpt?: string }> }).related ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/kb">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Knowledge Base
          </Button>
        </Link>
      </div>

      <article className="bg-white rounded-2xl border p-8">
        <div className="mb-6">
          {article.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="mr-1.5 mb-1.5 text-xs">{tag}</Badge>
          ))}
          <h1 className="text-3xl font-bold text-gray-900 mt-2 mb-3">{article.title}</h1>
          {article.excerpt && <p className="text-lg text-gray-500 mb-4">{article.excerpt}</p>}
          <div className="flex items-center gap-4 text-sm text-gray-400 border-b pb-4">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDate(article.publishedAt ?? article.createdAt)}</span>
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {article.views} views</span>
          </div>
        </div>
        <div className="prose-sm max-w-none">
          {renderContent(article.content ?? "")}
        </div>
      </article>

      {related.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Related Articles</h2>
          <div className="space-y-2">
            {related.map((r) => (
              <Link key={r.id} href={`/kb/articles/${r.id}`}>
                <Card className="hover:shadow-sm cursor-pointer group transition-shadow">
                  <CardContent className="p-3 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-primary transition-colors">{r.title}</p>
                      {r.excerpt && <p className="text-xs text-gray-500 truncate">{r.excerpt}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
