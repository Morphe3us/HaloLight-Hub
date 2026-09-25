// Credential-free sidebar fixture: node src/components/layout/sidebarNavigation.preview.mjs
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { Sidebar } from "/src/components/layout/Sidebar.tsx";
import { ThemeProvider } from "/src/components/theme-provider.tsx";
import "/src/index.css";
const params = new URLSearchParams(location.search);
localStorage.setItem("halolight-lang", params.get("lang") || "en");
const { setAppLanguage } = await import("/src/i18n/index.ts");
await setAppLanguage(params.get("lang") || "en");
localStorage.removeItem("sidebar-preview-theme");
createRoot(document.getElementById("root")).render(
  React.createElement(ThemeProvider, { defaultTheme: params.get("theme") || "light", storageKey: "sidebar-preview-theme" },
    React.createElement("div", { className: "flex flex-col md:flex-row min-h-screen bg-background" },
      React.createElement(Sidebar),
      React.createElement("main", { className: "flex-1", "aria-label": "Preview content" })
    )
  )
);
`;

const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  plugins: [
    {
      name: "sidebar-preview-fixtures",
      enforce: "pre",
      resolveId(id) {
        if (id === "/sidebar-preview-entry.js") return id;
        if (["@workspace/api-client-react", "@/auth/AuthProvider"].includes(id)) return `\0sidebar-fixture:${id}`;
      },
      load(id) {
        if (id === "/sidebar-preview-entry.js") return entry;
        if (id === "\0sidebar-fixture:@workspace/api-client-react") return `
          export const useGetCurrentUser = () => ({ data: { role: new URLSearchParams(location.search).get("role") || "client" } });
          export const useGetUnreadNotificationCount = () => ({ data: { count: 3 } });
        `;
        if (id === "\0sidebar-fixture:@/auth/AuthProvider") return `export const useAuth = () => ({ signOut() {} });`;
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.headers.accept?.includes("text/html")) {
            res.setHeader("Content-Type", "text/html");
            return res.end(await server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sidebar preview</title></head><body><div id="root"></div><script type="module" src="/sidebar-preview-entry.js"></script></body></html>'));
          }
          next();
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": `${root}/src` } },
  optimizeDeps: { exclude: ["@workspace/api-client-react", "@/auth/AuthProvider"] },
  server: { host: "127.0.0.1", port: 18215 },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exit(0); });
