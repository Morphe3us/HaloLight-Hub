import { existsSync } from "node:fs";
import path from "node:path";
import express, { type RequestHandler } from "express";

export function createFrontendHandler(directory: string): RequestHandler {
  const root = path.resolve(directory);
  const index = path.join(root, "index.html");
  if (!existsSync(index)) {
    throw new Error("Frontend build missing. Run the hosting build before starting production.");
  }
  const files = express.static(root, {
    index: false,
    dotfiles: "deny",
    redirect: false,
    setHeaders(res, filename) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", filename.endsWith(".html") ? "no-store" : "public, max-age=3600");
    },
  });
  return (req, res, next) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      res.sendStatus(400);
      return;
    }
    const lowerPath = pathname.toLowerCase();
    if (lowerPath === "/api" || lowerPath.startsWith("/api/")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // Never turn missing assets, dotfiles or source maps into a successful SPA response.
    if (pathname.split("/").some((segment) => segment.startsWith(".")) || lowerPath.endsWith(".map")) {
      res.sendStatus(404);
      return;
    }
    files(req, res, (error) => {
      if (error) return next(error);
      if (path.extname(pathname) || lowerPath.startsWith("/assets/") || !req.accepts("html")) {
        res.sendStatus(404);
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.sendFile(index, (sendError) => {
        if (sendError) next(sendError);
      });
    });
  };
}
