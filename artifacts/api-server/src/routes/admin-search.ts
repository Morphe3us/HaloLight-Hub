import { Router, type IRouter, type Request, type Response } from "express";
import { ilike, or, eq } from "drizzle-orm";
import {
  db, usersTable, courses, lessons, courseModules, resources,
  kbArticles, supportTickets, equipment,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /admin/search?q=...
router.get("/admin/search", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const q = (req.query.q as string ?? "").trim();
  if (!q || q.length < 2) { res.json({ items: [], total: 0 }); return; }

  const pattern = `%${q}%`;
  const items: Array<{ id: string; type: string; title: string; subtitle: string; href: string }> = [];

  // Users
  const matchedUsers = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    email: usersTable.email,
    companyName: usersTable.companyName,
    role: usersTable.role,
  }).from(usersTable)
    .where(or(ilike(usersTable.fullName, pattern), ilike(usersTable.email, pattern), ilike(usersTable.companyName, pattern)))
    .limit(5);

  for (const u of matchedUsers) {
    items.push({
      id: u.id, type: "user",
      title: u.fullName || u.email,
      subtitle: `${u.role} · ${u.email}`,
      href: `/admin/clients/${u.id}`,
    });
  }

  // Courses (search title jsonb en field via cast)
  const allCourses = await db.select().from(courses).limit(200);
  for (const c of allCourses) {
    const titleStr = Object.values(c.title as Record<string, string>).join(" ").toLowerCase();
    if (titleStr.includes(q.toLowerCase()) || c.category.toLowerCase().includes(q.toLowerCase())) {
      items.push({
        id: c.id, type: "course",
        title: (c.title as Record<string, string>).en ?? titleStr.split(" ")[0] ?? "Course",
        subtitle: `${c.category} · ${c.level} · ${c.isPublished ? "Published" : "Draft"}`,
        href: `/admin/academy`,
      });
      if (items.filter(i => i.type === "course").length >= 5) break;
    }
  }

  // Lessons
  const allLessons = await db.select({
    id: lessons.id,
    title: lessons.title,
    moduleId: lessons.moduleId,
    courseId: courseModules.courseId,
  }).from(lessons).innerJoin(courseModules, eq(lessons.moduleId, courseModules.id)).limit(200);

  for (const l of allLessons) {
    const titleStr = Object.values(l.title as Record<string, string>).join(" ").toLowerCase();
    if (titleStr.includes(q.toLowerCase())) {
      items.push({
        id: l.id, type: "lesson",
        title: (l.title as Record<string, string>).en ?? titleStr,
        subtitle: `Lesson in course`,
        href: `/admin/academy`,
      });
      if (items.filter(i => i.type === "lesson").length >= 5) break;
    }
  }

  // Resources
  const matchedResources = await db.select().from(resources)
    .where(ilike(resources.title, pattern)).limit(5);
  for (const r of matchedResources) {
    items.push({
      id: r.id, type: "resource",
      title: r.title,
      subtitle: `${r.category} · ${r.language} · ${r.status}`,
      href: `/admin/resources`,
    });
  }

  // KB Articles
  const matchedArticles = await db.select({
    id: kbArticles.id, title: kbArticles.title, status: kbArticles.status, slug: kbArticles.slug,
  }).from(kbArticles).where(ilike(kbArticles.title, pattern)).limit(5);
  for (const a of matchedArticles) {
    items.push({
      id: a.id, type: "article",
      title: a.title,
      subtitle: `Article · ${a.status}`,
      href: `/kb/articles/${a.id}`,
    });
  }

  // Support Tickets
  const matchedTickets = await db.select({
    id: supportTickets.id, title: supportTickets.title, status: supportTickets.status,
  }).from(supportTickets).where(ilike(supportTickets.title, pattern)).limit(5);
  for (const t of matchedTickets) {
    items.push({
      id: t.id, type: "ticket",
      title: t.title,
      subtitle: `Support · ${t.status}`,
      href: `/support/tickets/${t.id}`,
    });
  }

  // Equipment
  const matchedEquipment = await db.select({
    id: equipment.id, serialNumber: equipment.serialNumber, productModel: equipment.productModel, status: equipment.status,
  }).from(equipment).where(or(ilike(equipment.productModel, pattern), ilike(equipment.serialNumber, pattern))).limit(5);
  for (const e of matchedEquipment) {
    items.push({
      id: e.id, type: "equipment",
      title: e.productModel,
      subtitle: `${e.serialNumber} · ${e.status}`,
      href: `/admin/equipment`,
    });
  }

  res.json({ items, total: items.length });
});

export default router;
