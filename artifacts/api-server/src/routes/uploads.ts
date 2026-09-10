import { Router, type IRouter, type Request, type Response } from "express";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { eq, ilike, and } from "drizzle-orm";
import { db, kbArticles, resources, uploads } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { getStorageProvider } from "../lib/storage";
import { getLocalStorageFilePath } from "../lib/storage/local-provider";
import { canAccessResourceFile, canAccessUploadFile } from "../lib/fileAccess";
import {
  contentDispositionForFile,
  safeDownloadName,
  validateStoredFileUrl,
  validateUploadedFile,
} from "../lib/uploadSecurity";

const router: IRouter = Router();

router.use(["/files", "/admin/uploads"], (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

function requireAdmin(
  user: { role: string } | null | undefined,
  res: Response,
): boolean {
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

type UploadCategory =
  | "academy"
  | "knowledge_base"
  | "resources"
  | "marketing"
  | "contracts"
  | "product_manuals"
  | "ai_knowledge_base"
  | "support_documentation";
type UploadVisibility =
  | "admin_only"
  | "client_visible"
  | "ai_only"
  | "public_resource";
type UploadStatus = "pending" | "processing" | "ready" | "failed";

const importedPdfPrefix = "corrected-2026-09-10/";
const importedSourceMarker = "[sourceKey=halolight:corrected-content:fr:";

function importedSourceKey(description: string | null): string | null {
  if (!description || description.split("[sourceKey=").length !== 2)
    return null;
  return (
    /^\[sourceKey=(halolight:corrected-content:fr:[a-z0-9-]+)\](?:\s|$)/.exec(
      description,
    )?.[1] ?? null
  );
}

async function isImportedPdfPublished(
  upload: typeof uploads.$inferSelect,
  fileUrl: string,
): Promise<boolean> {
  const sourceKey = importedSourceKey(upload.description);
  if (!sourceKey) return false;
  const [article] = await db
    .select({ status: kbArticles.status })
    .from(kbArticles)
    .where(eq(kbArticles.sourceKey, sourceKey));
  if (article?.status !== "published") return false;
  const linkedResources = await db
    .select()
    .from(resources)
    .where(eq(resources.fileUrl, fileUrl));
  return linkedResources.some(
    (resource) =>
      resource.status === "published" &&
      importedSourceKey(resource.description) === sourceKey,
  );
}

function fmt(u: typeof uploads.$inferSelect) {
  return {
    id: u.id,
    title: u.title,
    language: u.language,
    category: u.category,
    fileUrl: u.fileUrl,
    fileName: u.fileName,
    mimeType: u.mimeType,
    fileSize: u.fileSize,
    visibility: u.visibility,
    status: u.status,
    relatedCourseId: u.relatedCourseId,
    relatedLessonId: u.relatedLessonId,
    relatedProduct: u.relatedProduct,
    description: u.description,
    uploadedBy: u.uploadedBy,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// GET /files/*
router.get(
  /^\/files\/(.+)$/,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawKey = String(req.params[0] ?? "");
    const fileUrl = req.originalUrl.split("?")[0] ?? "";
    let fileName: string | null | undefined;
    let mimeType: string | null | undefined;
    const [uploadRecord] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.fileUrl, fileUrl));

    if (uploadRecord) {
      if (!canAccessUploadFile(user, uploadRecord)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // Import publication is authoritative on each download, including copied URLs.
      const imported =
        rawKey.startsWith(importedPdfPrefix) ||
        uploadRecord.description?.includes(importedSourceMarker);
      if (
        user.role !== "admin" &&
        imported &&
        !(await isImportedPdfPublished(uploadRecord, fileUrl))
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      fileName = uploadRecord.fileName;
      mimeType = uploadRecord.mimeType;
    } else {
      if (user.role !== "admin" && rawKey.startsWith(importedPdfPrefix)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.fileUrl, fileUrl));
      if (!resource) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      if (!canAccessResourceFile(user, resource)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      fileName = resource.title;
      mimeType = null;
    }

    let filePath: string | undefined;
    let stream: Readable | undefined;
    try {
      // Express has already decoded route parameters; never decode a key twice.
      const provider = getStorageProvider();
      if (provider.openReadStream) {
        stream = await provider.openReadStream(rawKey);
      } else if (provider.name === "local") {
        filePath = getLocalStorageFilePath(rawKey);
      } else {
        res.status(404).json({ error: "File not found" });
        return;
      }
    } catch {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const disposition = contentDispositionForFile({ fileName, mimeType });
    const downloadName = safeDownloadName(fileName);
    const encodedDownloadName = encodeURIComponent(downloadName);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${downloadName}"; filename*=UTF-8''${encodedDownloadName}`,
    );

    if (stream) {
      try {
        await pipeline(stream, res);
      } catch {
        if (!res.headersSent && !res.destroyed) {
          res.status(404).json({ error: "File not found" });
        }
      }
      return;
    }

    res.sendFile(filePath!, { cacheControl: false }, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: "File not found" });
      }
    });
  },
);

// GET /admin/uploads
router.get(
  "/admin/uploads",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const { category, visibility, language, q } = req.query as Record<
      string,
      string
    >;

    const conditions = [];
    if (category)
      conditions.push(eq(uploads.category, category as UploadCategory));
    if (visibility)
      conditions.push(eq(uploads.visibility, visibility as UploadVisibility));
    if (language) conditions.push(eq(uploads.language, language));
    if (q) conditions.push(ilike(uploads.title, `%${q}%`));

    const items =
      conditions.length > 0
        ? await db
            .select()
            .from(uploads)
            .where(and(...conditions))
            .orderBy(uploads.createdAt)
        : await db.select().from(uploads).orderBy(uploads.createdAt);

    res.json({ items: items.map(fmt), total: items.length });
  },
);

// POST /admin/uploads
router.post(
  "/admin/uploads",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const {
      title,
      language,
      category,
      fileUrl,
      fileName,
      mimeType,
      fileSize,
      visibility,
      relatedCourseId,
      relatedLessonId,
      relatedProduct,
      description,
    } = req.body as {
      title?: string;
      language?: string;
      category?: string;
      fileUrl?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      visibility?: string;
      relatedCourseId?: string;
      relatedLessonId?: string;
      relatedProduct?: string;
      description?: string;
    };

    if (!title || !category || !fileUrl) {
      res
        .status(400)
        .json({ error: "title, category, and fileUrl are required" });
      return;
    }
    const storedFileUrl = validateStoredFileUrl(fileUrl);
    if (!storedFileUrl.ok) {
      res.status(400).json({ error: storedFileUrl.error });
      return;
    }

    const [item] = await db
      .insert(uploads)
      .values({
        title,
        language: language ?? "en",
        category: category as UploadCategory,
        fileUrl: storedFileUrl.url,
        fileName: fileName ?? null,
        mimeType: mimeType ?? null,
        fileSize: fileSize ?? null,
        visibility: (visibility as UploadVisibility) ?? "admin_only",
        status: "ready",
        relatedCourseId: relatedCourseId ?? null,
        relatedLessonId: relatedLessonId ?? null,
        relatedProduct: relatedProduct ?? null,
        description: description ?? null,
        uploadedBy: user!.id,
      })
      .returning();

    res.status(201).json(fmt(item!));
  },
);

// POST /admin/uploads/file
router.post(
  "/admin/uploads/file",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const { fileName, mimeType, dataBase64, folder } = req.body as {
      fileName?: string;
      mimeType?: string;
      dataBase64?: string;
      folder?: string;
    };

    if (!fileName || !dataBase64) {
      res.status(400).json({ error: "fileName and dataBase64 are required" });
      return;
    }

    const payload = dataBase64.includes(",")
      ? dataBase64.slice(dataBase64.indexOf(",") + 1)
      : dataBase64;
    if (payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
      res.status(400).json({ error: "Invalid file payload" });
      return;
    }
    const buffer = Buffer.from(payload, "base64");
    if (buffer.length === 0) {
      res.status(400).json({ error: "Invalid file payload" });
      return;
    }
    if (buffer.length > 20 * 1024 * 1024) {
      res.status(400).json({ error: "File exceeds the 20MB upload limit" });
      return;
    }

    const validation = validateUploadedFile({ fileName, mimeType, buffer });
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    let result: Awaited<
      ReturnType<ReturnType<typeof getStorageProvider>["upload"]>
    >;
    try {
      result = await getStorageProvider().upload(buffer, {
        filename: fileName,
        contentType: validation.mimeType,
        folder: folder || "uploads",
        isPublic: false,
      });
    } catch {
      res.status(400).json({
        error: "Direct file upload is not available",
      });
      return;
    }

    res.status(201).json({
      url: result.url,
      key: result.key,
      fileName,
      mimeType: result.contentType ?? validation.mimeType,
      fileSize: result.size ?? buffer.length,
      provider: result.provider,
    });
  },
);

// PUT /admin/uploads/:id
router.put(
  "/admin/uploads/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const id = String(req.params.id);
    const {
      title,
      language,
      category,
      fileUrl,
      fileName,
      mimeType,
      fileSize,
      visibility,
      relatedCourseId,
      relatedLessonId,
      relatedProduct,
      description,
      status,
    } = req.body as Record<string, string | number | undefined>;

    const u: Partial<typeof uploads.$inferInsert> = { updatedAt: new Date() };
    if (title) u.title = title as string;
    if (language) u.language = language as string;
    if (category) u.category = category as UploadCategory;
    if (fileUrl) {
      const storedFileUrl = validateStoredFileUrl(fileUrl);
      if (!storedFileUrl.ok) {
        res.status(400).json({ error: storedFileUrl.error });
        return;
      }
      u.fileUrl = storedFileUrl.url;
    }
    if (fileName !== undefined) u.fileName = fileName as string;
    if (mimeType !== undefined) u.mimeType = mimeType as string;
    if (fileSize !== undefined) u.fileSize = Number(fileSize);
    if (visibility) u.visibility = visibility as UploadVisibility;
    if (status) u.status = status as UploadStatus;
    if (relatedCourseId !== undefined)
      u.relatedCourseId = relatedCourseId as string;
    if (relatedLessonId !== undefined)
      u.relatedLessonId = relatedLessonId as string;
    if (relatedProduct !== undefined)
      u.relatedProduct = relatedProduct as string;
    if (description !== undefined) u.description = description as string;

    const [updated] = await db
      .update(uploads)
      .set(u)
      .where(eq(uploads.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    res.json(fmt(updated));
  },
);

// DELETE /admin/uploads/:id
router.delete(
  "/admin/uploads/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const id = String(req.params.id);
    await db.delete(uploads).where(eq(uploads.id, id));
    res.status(204).send();
  },
);

export default router;
