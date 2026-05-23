import { useState } from "react";
import { Link } from "wouter";
import {
  useListKbCategories, useListKbArticles, useCreateKbArticle,
  useUpdateKbArticle, useDeleteKbArticle,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, ArrowLeft, ExternalLink, FileText } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-warning/15 text-yellow-700",
  published: "bg-success/15 text-success",
  archived: "bg-muted text-muted-foreground",
};

type ArticleForm = {
  categoryId: string;
  title: string;
  content: string;
  excerpt: string;
  status: string;
  tags: string;
};

const emptyForm: ArticleForm = { categoryId: "", title: "", content: "", excerpt: "", status: "draft", tags: "" };

export default function KBAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: categoriesData } = useListKbCategories();
  const { data: articlesData, isLoading } = useListKbArticles({
    categoryId: categoryFilter || undefined,
  });

  const { mutate: createArticle, isPending: isCreating } = useCreateKbArticle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/kb/articles"] });
        setShowForm(false);
        setForm(emptyForm);
        toast({ title: "Article created" });
      },
    },
  });

  const { mutate: updateArticle, isPending: isUpdating } = useUpdateKbArticle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/kb/articles"] });
        setShowForm(false);
        setEditId(null);
        setForm(emptyForm);
        toast({ title: "Article updated" });
      },
    },
  });

  const { mutate: deleteArticle } = useDeleteKbArticle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/kb/articles"] });
        setDeleteId(null);
        toast({ title: "Article deleted" });
      },
    },
  });

  const categories = categoriesData?.items ?? [];
  const articles = articlesData?.items ?? [];

  const handleEdit = (article: typeof articles[0]) => {
    setEditId(article.id ?? null);
    setForm({
      categoryId: article.categoryId ?? "",
      title: article.title ?? "",
      content: article.content ?? "",
      excerpt: article.excerpt ?? "",
      status: article.status ?? "draft",
      tags: article.tags?.join(", ") ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    const payload = {
      categoryId: form.categoryId,
      title: form.title,
      content: form.content,
      excerpt: form.excerpt || undefined,
      status: form.status as "draft",
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    };
    if (editId) {
      updateArticle({ id: editId, data: payload });
    } else {
      createArticle({ data: payload });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/kb">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Knowledge Base
            </Button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-semibold text-foreground">Manage Articles</h1>
        </div>
        <Button onClick={() => { setEditId(null); setForm(emptyForm); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          New Article
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No articles yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <Card key={article.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge className={`text-xs ${statusColors[article.status ?? "draft"] ?? ""}`}>{article.status}</Badge>
                    <span className="text-xs text-muted-foreground">{categories.find((c) => c.id === article.categoryId)?.name}</span>
                  </div>
                  <p className="font-medium text-foreground truncate">{article.title}</p>
                  {article.excerpt && <p className="text-xs text-muted-foreground truncate">{article.excerpt}</p>}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Eye className="w-3 h-3" />{article.views}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link href={`/kb/articles/${article.id}`}>
                    <Button variant="ghost" size="sm" title="View"><ExternalLink className="w-4 h-4" /></Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(article)} title="Edit">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-destructive" onClick={() => setDeleteId(article.id ?? null)} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Article" : "New Article"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Excerpt</Label>
              <Input value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} className="mt-1" placeholder="Short summary..." />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} className="mt-1 font-mono text-sm" placeholder="Markdown-style content..." />
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1" placeholder="setup, equipment, billing..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || !form.content || !form.categoryId || isCreating || isUpdating}>
              {editId ? "Update" : "Create"} Article
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={() => deleteId && deleteArticle({ id: deleteId })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
