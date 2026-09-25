import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "18205";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080";

export default defineConfig({
  base: basePath,
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // CommonJS wrappers are shared by React and lazy dependencies.
          if (id.includes("commonjsHelpers.js")) return "vendor-react";
          if (id.includes("/lib/api-client-react/")) return "api-client";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "vendor-auth";
          if (id.includes("@tanstack")) return "vendor-query";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/react-is/") ||
            id.includes("/node_modules/scheduler/") ||
            id.includes("/node_modules/wouter/")
          ) {
            return "vendor-react";
          }
          // Let Rollup split charts by usage. A forced chart chunk absorbs
          // shared clsx code, making the entry preload the entire chart library.
          if (id.includes("date-fns")) return "vendor-date";
          if (id.includes("i18next")) return "vendor-i18n";
          if (
            id.includes("zod") ||
            id.includes("react-hook-form") ||
            id.includes("@hookform")
          ) {
            return "vendor-forms";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    headers: {
      // Allow nested BunnyStream iframes to use autoplay, fullscreen, and encrypted-media
      // even when the app itself is embedded inside Replit's preview iframe.
      "Permissions-Policy": "autoplay=*, fullscreen=*, encrypted-media=*, picture-in-picture=*, gyroscope=*, accelerometer=*",
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Permissions-Policy": "autoplay=*, fullscreen=*, encrypted-media=*, picture-in-picture=*, gyroscope=*, accelerometer=*",
    },
  },
});
