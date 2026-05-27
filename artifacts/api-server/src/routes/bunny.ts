import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc } from "drizzle-orm";
import { db, courses, courseModules, lessons } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

const BUNNY_API = "https://video.bunnycdn.com";

// Fixed collection ID → language mapping. Collection ID is the single source of truth.
// Never infer language from collection names or video metadata.
const COLLECTION_ID_TO_LANG: Record<string, string> = {
  "a8f1d88d-d78b-40a3-8110-3b573a1603e2": "de",
  "3e3b7105-0fd0-4f48-a223-9b0842e4e3e5": "es",
  "dba3c601-c795-43a6-9ee7-f48365a0e4de": "pt",
  "c415e75f-4c65-4314-bec2-fa968e1397ff": "pl",
  "50ecaca6-0542-4c91-af26-d3006fa02b08": "it",
  "630999cb-1df6-43f2-8cff-dc49950be601": "en",
  "b7b1ee25-e810-4784-bf85-3a476114ad1a": "nl",
  "476e5f64-87b2-4dee-8a80-5ef6cc544378": "fr",
};

function requireAdmin(user: { role: string } | null | undefined, res: Response): boolean {
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

function getConfig(): { apiKey: string; libraryId: string } | null {
  const apiKey = process.env["BUNNY_STREAM_API_KEY"];
  const libraryId = process.env["BUNNY_STREAM_LIBRARY_ID"];
  if (!apiKey || !libraryId) return null;
  return { apiKey, libraryId };
}

async function bunnyGet(path: string, apiKey: string): Promise<unknown> {
  const url = `${BUNNY_API}${path}`;
  const res = await fetch(url, {
    headers: { AccessKey: apiKey, accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BunnyStream ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

function buildEmbedUrl(libraryId: string, videoId: string): string {
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
}

function buildThumbnailUrl(pullZoneHostname: string, videoId: string): string {
  return `https://${pullZoneHostname}/${videoId}/thumbnail.jpg`;
}

function buildPreviewUrl(pullZoneHostname: string, videoId: string): string {
  return `https://${pullZoneHostname}/${videoId}/preview.webp`;
}

function statusLabel(code: number): string {
  switch (code) {
    case 0: return "created";
    case 1: return "uploaded";
    case 2: return "processing";
    case 3: return "transcoding";
    case 4: return "ready";
    case 5: return "error";
    case 6: return "upload_failed";
    default: return "unknown";
  }
}

// GET /admin/bunny/status
router.get("/admin/bunny/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const cfg = getConfig();
  if (!cfg) {
    res.json({ connected: false, error: "BUNNY_STREAM_API_KEY or BUNNY_STREAM_LIBRARY_ID not configured" });
    return;
  }

  try {
    const lib = await bunnyGet(`/library/${cfg.libraryId}`, cfg.apiKey) as Record<string, unknown>;
    res.json({
      connected: true,
      libraryId: cfg.libraryId,
      libraryName: lib["Name"] ?? "",
      pullZoneHostname: lib["PullZoneHostname"] ?? "",
      videoCount: lib["VideoCount"] ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ err }, "BunnyStream status check failed");
    res.json({ connected: false, error: msg });
  }
});

// GET /admin/bunny/diagnose?videoId=xxx
// Temporary diagnostic endpoint: returns library security settings + per-video status.
router.get("/admin/bunny/diagnose", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const cfg = getConfig();
  if (!cfg) { res.status(400).json({ error: "BunnyStream not configured" }); return; }

  try {
    const lib = await bunnyGet(`/library/${cfg.libraryId}`, cfg.apiKey) as Record<string, unknown>;

    const libraryInfo = {
      name: lib["Name"],
      libraryId: cfg.libraryId,
      tokenAuthenticationEnabled: lib["TokenAuthenticationEnabled"] ?? false,
      blockNoneReferrer: lib["BlockNoneReferrer"] ?? false,
      allowedReferrers: (lib["AllowedReferrers"] as string[] | null) ?? [],
      pullZoneHostname: lib["PullZoneHostname"] ?? "",
      enabledResolutions: lib["EnabledResolutions"] ?? "",
      allowDirectPlay: lib["AllowDirectPlay"] ?? false,
    };

    let videoInfo: Record<string, unknown> | null = null;
    const videoId = req.query["videoId"] as string | undefined;
    if (videoId) {
      try {
        const video = await bunnyGet(`/library/${cfg.libraryId}/videos/${videoId}`, cfg.apiKey) as Record<string, unknown>;
        videoInfo = {
          videoId: video["guid"],
          title: video["title"],
          status: video["status"],
          statusLabel: statusLabel(Number(video["status"])),
          encodeProgress: video["encodeProgress"],
          length: video["length"],
          width: video["width"],
          height: video["height"],
          framerate: video["framerate"],
          storageSize: video["storageSize"],
          collectionId: video["collectionId"],
          embedUrl: buildEmbedUrl(cfg.libraryId, String(video["guid"] ?? "")),
        };
      } catch (err) {
        videoInfo = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    res.json({ libraryInfo, videoInfo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ err }, "BunnyStream diagnose failed");
    res.status(500).json({ error: msg });
  }
});

// GET /admin/bunny/collections
router.get("/admin/bunny/collections", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const cfg = getConfig();
  if (!cfg) { res.status(400).json({ error: "BunnyStream not configured" }); return; }

  try {
    const data = await bunnyGet(
      `/library/${cfg.libraryId}/collections?page=1&itemsPerPage=200&includeThumbnails=false`,
      cfg.apiKey,
    ) as Record<string, unknown>;

    const rawItems = (data["items"] as unknown[]) ?? [];
    const items = rawItems.map((c: unknown) => {
      const col = c as Record<string, unknown>;
      const guid = String(col["guid"] ?? "");
      const lang = COLLECTION_ID_TO_LANG[guid] ?? null;
      return {
        guid,
        name: String(col["name"] ?? ""),
        videoCount: Number(col["videoCount"] ?? 0),
        lang,
        langKnown: lang !== null,
      };
    });

    res.json({ items, total: items.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "BunnyStream collections fetch failed");
    res.status(502).json({ error: msg });
  }
});

// GET /admin/bunny/collections/:collectionId/videos
router.get("/admin/bunny/collections/:collectionId/videos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const cfg = getConfig();
  if (!cfg) { res.status(400).json({ error: "BunnyStream not configured" }); return; }

  const { collectionId } = req.params;
  const ITEMS_PER_PAGE = 100; // BunnyStream max per page

  // Reject unknown collection IDs before hitting Bunny API
  const detectedLanguage = COLLECTION_ID_TO_LANG[collectionId];
  if (!detectedLanguage) {
    res.status(400).json({
      error: `Collection ID "${collectionId}" is not in the fixed language mapping. Browsing blocked.`,
      requestedCollectionId: collectionId,
    });
    return;
  }

  try {
    // Get library info for pull zone hostname
    const lib = await bunnyGet(`/library/${cfg.libraryId}`, cfg.apiKey) as Record<string, unknown>;
    const pullZoneHostname = String(lib["PullZoneHostname"] ?? "");

    // Paginate through all pages for this collection only.
    // BunnyStream's filter param is "collection" (not "collectionId").
    const allRawItems: unknown[] = [];
    let page = 1;
    let totalItems = 0;
    let pagesLoaded = 0;

    do {
      const data = await bunnyGet(
        `/library/${cfg.libraryId}/videos?collection=${encodeURIComponent(collectionId)}&page=${page}&itemsPerPage=${ITEMS_PER_PAGE}&orderBy=title`,
        cfg.apiKey,
      ) as Record<string, unknown>;

      const pageItems = (data["items"] as unknown[]) ?? [];
      totalItems = Number(data["totalItems"] ?? pageItems.length);
      allRawItems.push(...pageItems);
      pagesLoaded++;

      // Stop if this page returned fewer items than requested (last page)
      if (pageItems.length < ITEMS_PER_PAGE) break;
      // Stop if we already have all items reported by the API
      if (allRawItems.length >= totalItems) break;

      page++;
    } while (true);

    // Deduplicate by guid in case of API overlap
    const seenGuids = new Set<string>();
    const uniqueRaw = allRawItems.filter((v: unknown) => {
      const vid = v as Record<string, unknown>;
      const guid = String(vid["guid"] ?? "");
      if (seenGuids.has(guid)) return false;
      seenGuids.add(guid);
      return true;
    });

    // Double-check: discard any videos the API returned that don't belong to this collection.
    // This guards against BunnyStream silently ignoring the filter parameter.
    const filteredRaw = uniqueRaw.filter((v: unknown) => {
      const vid = v as Record<string, unknown>;
      return String(vid["collectionId"] ?? "") === collectionId;
    });

    const crossCollectionCount = uniqueRaw.length - filteredRaw.length;
    if (crossCollectionCount > 0) {
      req.log.warn({ collectionId, crossCollectionCount }, "BunnyStream returned videos from other collections — they have been stripped");
    }

    const items = filteredRaw
      .map((v: unknown) => {
        const vid = v as Record<string, unknown>;
        const videoId = String(vid["guid"] ?? "");
        const status = Number(vid["status"] ?? 0);
        const isReady = status === 4;
        return {
          guid: videoId,
          title: String(vid["title"] ?? ""),
          collectionId: String(vid["collectionId"] ?? ""),
          durationSeconds: Number(vid["length"] ?? 0),
          status,
          statusLabel: statusLabel(status),
          isReady,
          embedUrl: buildEmbedUrl(cfg.libraryId, videoId),
          thumbnailUrl: pullZoneHostname ? buildThumbnailUrl(pullZoneHostname, videoId) : "",
          previewUrl: pullZoneHostname ? buildPreviewUrl(pullZoneHostname, videoId) : "",
          width: Number(vid["width"] ?? 0),
          height: Number(vid["height"] ?? 0),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    req.log.info(
      { requestedCollectionId: collectionId, detectedLanguage, pagesLoaded, totalFetched: items.length, totalReported: totalItems },
      "BunnyStream videos fetched",
    );

    res.json({
      items,
      total: items.length,
      totalReported: totalItems,
      pagesLoaded: pagesLoaded,
      // Debug fields
      requestedCollectionId: collectionId,
      detectedLanguage,
      totalVideosReturned: items.length,
      pagesFetched: pagesLoaded,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "BunnyStream videos fetch failed");
    res.status(502).json({ error: msg });
  }
});

// POST /admin/bunny/import
router.post("/admin/bunny/import", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  type ImportItem = {
    videoId: string;
    collectionId: string; // required — used to enforce lang via COLLECTION_ID_TO_LANG
    embedUrl: string;
    thumbnailUrl: string;
    previewUrl?: string;
    durationSeconds: number;
    videoTitle: string;
    // Assignment
    courseId?: string;
    moduleId?: string;
    lessonId?: string;
    newModuleName?: string;
    newLessonName?: string;
  };

  const items: ImportItem[] = req.body.items ?? [];
  let imported = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const { videoId, collectionId, embedUrl, thumbnailUrl, previewUrl, durationSeconds, videoTitle } = item;

      if (!videoId || !collectionId || !embedUrl) {
        errors.push(`Missing required fields for video ${videoId ?? "unknown"}`);
        continue;
      }

      // Enforce lang strictly from fixed collection ID map — never trust client-sent lang
      const lang = COLLECTION_ID_TO_LANG[collectionId];
      if (!lang) {
        errors.push(`Video "${videoTitle}": collection ID "${collectionId}" is not in the fixed language mapping. Import blocked.`);
        continue;
      }

      // Don't persist empty strings — omit missing fields entirely
      const newAsset = {
        embedUrl,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        videoId,
      };

      // Resolve the lesson
      let lessonId = item.lessonId;

      if (!lessonId) {
        // Need courseId to resolve/create module+lesson
        if (!item.courseId) {
          errors.push(`No courseId or lessonId for video "${videoTitle}"`);
          continue;
        }

        // Resolve or create module
        let moduleId = item.moduleId;
        if (!moduleId && item.newModuleName) {
          // Find module by title in this course
          const existingModules = await db.select().from(courseModules)
            .where(eq(courseModules.courseId, item.courseId))
            .orderBy(asc(courseModules.order));

          const matchingMod = existingModules.find(m => {
            const t = m.title as Record<string, string>;
            return Object.values(t).some(v => v.toLowerCase() === item.newModuleName!.toLowerCase());
          });

          if (matchingMod) {
            moduleId = matchingMod.id;
          } else {
            const [newMod] = await db.insert(courseModules).values({
              courseId: item.courseId,
              title: { en: item.newModuleName },
              order: existingModules.length + 1,
            }).returning();
            moduleId = newMod.id;
            created++;
          }
        }

        if (!moduleId) {
          errors.push(`No moduleId or newModuleName for video "${videoTitle}"`);
          continue;
        }

        // Resolve or create lesson
        const lessonName = item.newLessonName || videoTitle;
        const existingLessons = await db.select().from(lessons)
          .where(eq(lessons.moduleId, moduleId))
          .orderBy(asc(lessons.order));

        const matchingLesson = existingLessons.find(l => {
          const t = l.title as Record<string, string>;
          return Object.values(t).some(v => v.toLowerCase() === lessonName.toLowerCase());
        });

        if (matchingLesson) {
          lessonId = matchingLesson.id;
        } else {
          const [newLesson] = await db.insert(lessons).values({
            moduleId,
            title: { en: lessonName, [lang]: lessonName },
            videoAssets: { [lang]: newAsset } as Record<string, typeof newAsset>,
            durationSeconds,
            order: existingLessons.length + 1,
            isPublished: true, // publish immediately so client Academy can see it
          }).returning();
          lessonId = newLesson.id;
          created++;
          imported++;
          continue;
        }
      }

      // Upsert videoAssets[lang] on existing lesson
      const [existing] = await db.select({ videoAssets: lessons.videoAssets }).from(lessons).where(eq(lessons.id, lessonId!));
      if (!existing) {
        errors.push(`Lesson ${lessonId} not found`);
        continue;
      }

      const currentAssets = (existing.videoAssets as Record<string, unknown> | null) ?? {};
      const updatedAssets = { ...currentAssets, [lang]: newAsset };

      await db.update(lessons)
        .set({
          videoAssets: updatedAssets as typeof lessons.$inferInsert.videoAssets,
          durationSeconds: durationSeconds || undefined,
          // Set legacy fields from EN as fallback
          ...(lang === "en" ? {
            thumbnailUrl: thumbnailUrl || undefined,
          } : {}),
        })
        .where(eq(lessons.id, lessonId!));

      updated++;
      imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.error({ err }, `Import failed for video ${item.videoId}`);
      errors.push(`Video ${item.videoId}: ${msg}`);
    }
  }

  res.json({ imported, created, updated, errors });
});

export default router;
