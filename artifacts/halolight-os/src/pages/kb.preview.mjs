// Dev-only, credential-free fixture. Not imported by the app or production build.
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import KnowledgeBase from "/src/pages/KnowledgeBase.tsx";
import KBArticle from "/src/pages/KBArticle.tsx";
import KBAdmin from "/src/pages/KBAdmin.tsx";
import { Sidebar } from "/src/components/layout/Sidebar.tsx";
import { ThemeProvider } from "/src/components/theme-provider.tsx";
import "/src/index.css";
const params = new URLSearchParams(location.search);
localStorage.setItem("halolight-lang", params.get("lang") || "en");
const { setAppLanguage } = await import("/src/i18n/index.ts");
await setAppLanguage(params.get("lang") || "en");
setAuthTokenGetter(() => "kb-preview-" + (params.get("role") || "client"));
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById("root")).render(
  React.createElement(QueryClientProvider, { client },
    React.createElement(ThemeProvider, { defaultTheme: "light", storageKey: "kb-preview-theme" },
      React.createElement("div", { className: "flex flex-col md:flex-row min-h-screen bg-background" },
        React.createElement(Sidebar),
        React.createElement("main", { className: "flex-1 min-w-0 p-4 md:p-8" },
          React.createElement(Switch, null,
            React.createElement(Route, { path: "/kb/admin", component: KBAdmin }),
            React.createElement(Route, { path: "/kb/articles/:id", component: KBArticle }),
            React.createElement(Route, { component: KnowledgeBase })
          )
        )
      )
    )
  )
);
`;

export async function startKbPreview(port = 0) {
  const requests = [];
  const state = { failList: false, failDownload: false };
  const articles = Array.from({ length: 47 }, (_, index) => ({
    id: `12345678-1234-1234-1234-${String(index + 1).padStart(12, "0")}`,
    categoryId: "12345678-1234-1234-1234-999999999999",
    title: index === 0 ? "Écran et sécurité" : `Documentation française ${String(index + 1).padStart(2, "0")}`,
    excerpt: "Guide technique corrigé pour les utilisateurs HaloLight.",
    content: index === 0 ? "# Consignes de sécurité\n\n**Vérifier la température.**\n\n| Contrôle | Valeur |\n| --- | --- |\n| Écran | Conforme |\n\n- Vérifier les connexions\n\n[Guide PDF](/api/files/kb/guide.pdf)\n\n<script>alert('unsafe')</script>" : "# Documentation\n\nGuide corrigé.",
    tags: index === 0 ? ["température", "sécurité"] : ["documentation"],
    language: "fr", status: "published", views: 12, sourceKey: "fixture-fr-guide", sourceRevision: "2026-09-10", sourceHash: "fixture", aiEligible: false,
    publishedAt: "2026-09-10T00:00:00.000Z", related: [],
  }));
  const fold = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const server = await createServer({
    root, configFile: false, envFile: false, cacheDir: await mkdtemp(join(tmpdir(), "kb-preview-cache-")),
    plugins: [{
      name: "kb-preview-only", enforce: "pre",
      resolveId(id) { if (id === "/kb-preview-entry.js") return id; if (id === "@clerk/react") return "\0kb-clerk-fixture"; },
      load(id) { if (id === "/kb-preview-entry.js") return entry; if (id === "\0kb-clerk-fixture") return "export const useClerk = () => ({ signOut() {} });"; },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, "http://localhost");
          if (url.pathname.startsWith("/api/")) {
            requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), authorization: req.headers.authorization, method: req.method });
            res.setHeader("Content-Type", "application/json");
            const json = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)); };
            if (!/^Bearer kb-preview-(client|admin)$/.test(req.headers.authorization ?? "")) return json({ error: "Fixture authentication required" }, 401);
            if (url.pathname === "/api/users/me") return json({ id: "fixture-user", role: req.headers.authorization.endsWith("admin") ? "admin" : "client", language: "en" });
            if (url.pathname.includes("unread")) return json({ count: 3 });
            if (url.pathname === "/api/files/kb/guide.pdf") {
              if (state.failDownload) return json({ error: "Fixture denied" }, 403);
              res.setHeader("Content-Type", "application/pdf");
              return res.end("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
            }
            if (url.pathname === "/api/kb/categories") return json({ items: url.searchParams.get("language") === "en" ? [] : [{ id: articles[0].categoryId, name: "Documentation technique", language: "fr", articleCount: 47 }] });
            if (url.pathname === "/api/kb/articles") {
              if (state.failList) return json({ error: "Fixture unavailable" }, 503);
              const language = url.searchParams.get("language");
              const search = fold(url.searchParams.get("search") || "");
              const matches = articles.filter(article => (!language || article.language === language) && fold([article.title, article.content, ...article.tags].join(" ")).includes(search));
              const offset = Number(url.searchParams.get("offset") || 0);
              const limit = Number(url.searchParams.get("limit") || 50);
              return json({ items: matches.slice(offset, offset + limit), total: matches.length });
            }
            const article = articles.find(article => url.pathname === "/api/kb/articles/" + article.id);
            if (article) return json(article);
            return json({ error: "No fixture for this endpoint" }, 404);
          }
          if (req.headers.accept?.includes("text/html")) {
            res.setHeader("Content-Type", "text/html");
            return res.end(await server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>KB smoke preview</title></head><body><div id="root"></div><script type="module" src="/kb-preview-entry.js"></script></body></html>'));
          }
          next();
        });
      },
    }, react(), tailwindcss()],
    resolve: { alias: { "@": `${root}/src` }, dedupe: ["react", "react-dom"] },
    optimizeDeps: { exclude: ["@clerk/react"] },
    server: { host: "127.0.0.1", port },
  });
  await server.listen();
  return { server, requests, state, url: `http://127.0.0.1:${server.httpServer.address().port}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const preview = await startKbPreview(Number(process.env.KB_PREVIEW_PORT || 0));
  console.log(preview.url + "/kb?lang=en");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await preview.server.close(); process.exit(0); });
}
