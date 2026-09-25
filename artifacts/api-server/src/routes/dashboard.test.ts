import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Request, Response } from "express";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "@workspace/db/schema";
import { createDatabasePool } from "@workspace/db/poolConfig";
import * as academyLanguage from "../lib/academyLanguage";
import * as bunnyThumbnail from "../lib/bunnyThumbnail";
import type { PublishedAcademyCatalog } from "../lib/academyCatalog";

const now = new Date("2026-09-25T12:00:00.000Z");
const day = 86_400_000;
const userId = "dashboard-user";
const emptyCatalog: PublishedAcademyCatalog = {
  courses: [],
  modules: [],
  lessons: [],
};
const code = transformSync(
  readFileSync(new URL("./dashboard.ts", import.meta.url), "utf8"),
  {
    loader: "ts",
    format: "cjs",
  },
).code;

type Query = { sql: string; params: unknown[] };
type Execute = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: unknown[][] }>;

function harness(
  options: {
    counts?: string[];
    catalog?: PublishedAcademyCatalog;
    progress?: unknown[][];
    execute?: Execute;
  } = {},
) {
  const queries: Query[] = [];
  let catalogReads = 0;
  let handler!: (req: Request, res: Response) => Promise<void>;
  const db = drizzle(async (sql, params) => {
    queries.push({ sql, params });
    if (options.execute) return options.execute(sql, params);
    return {
      rows: sql.includes('from "user_lesson_progress"')
        ? (options.progress ?? [])
        : [options.counts ?? Array(12).fill("0")],
    };
  });
  const dependencies: Record<string, unknown> = {
    express: {
      Router: () => ({
        get: (_path: string, _auth: unknown, callback: typeof handler) => {
          handler = callback;
        },
      }),
    },
    "drizzle-orm": orm,
    "@workspace/db": { ...schema, db },
    "../middlewares/requireAuth": { requireAuth: () => {} },
    "../lib/userSync": {
      getOrCreateUser: async (req: Request) =>
        req.headers["x-user"]
          ? {
              id: req.headers["x-user"],
              language: "fr",
              role: req.headers["x-role"] ?? "client",
            }
          : null,
    },
    "../lib/academyCatalog": {
      getPublishedAcademyCatalog: async () => {
        catalogReads++;
        return options.catalog ?? emptyCatalog;
      },
    },
    "../lib/academyLanguage": academyLanguage,
    "../lib/bunnyThumbnail": bunnyThumbnail,
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "Date", code)(
    (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), name);
      return dependencies[name];
    },
    module,
    module.exports,
    class extends Date {
      constructor(value?: number) {
        super(value ?? now.getTime());
      }
    },
  );
  return {
    queries,
    get catalogReads() {
      return catalogReads;
    },
    async request(id: string | null = userId, lang?: string, role = "client") {
      const response = { statusCode: 200, body: {} as Record<string, unknown>, headers: {} as Record<string, string> };
      const res = {
        setHeader(name: string, value: string) {
          response.headers[name.toLowerCase()] = value;
        },
        status(value: number) {
          response.statusCode = value;
          return res;
        },
        json(value: Record<string, unknown>) {
          response.body = value;
        },
      };
      await handler(
        {
          headers: { "x-user": id, "x-role": role },
          query: { lang },
        } as unknown as Request,
        res as unknown as Response,
      );
      assert.equal(response.headers["cache-control"], "private, no-store");
      return response;
    },
  };
}

const zeroSummary = {
  unreadNotifications: 0,
  onboardingPercent: 0,
  academyCoursesCompleted: 0,
  academyLessonsCompleted: 0,
  academyTotalLessons: 0,
  upcomingEventsCount: 0,
  totalEventsCount: 0,
  equipmentAlerts: 0,
  lowStockCount: 0,
  openTicketsCount: 0,
  leadsCount: 0,
  quotesCount: 0,
  contractsCount: 0,
  invoicesCount: 0,
  nextLesson: null,
};

test("dashboard executes one count statement and converts all driver counts to numbers", async () => {
  const h = harness({
    counts: ["1", "3", "2", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  });
  assert.deepEqual((await h.request()).body, {
    ...zeroSummary,
    unreadNotifications: 1,
    onboardingPercent: 67,
    upcomingEventsCount: 4,
    totalEventsCount: 5,
    equipmentAlerts: 6,
    lowStockCount: 7,
    openTicketsCount: 8,
    leadsCount: 9,
    quotesCount: 10,
    contractsCount: 11,
    invoicesCount: 12,
  });
  assert.equal(
    h.queries.length,
    1,
    "subquery builders must not execute separately",
  );
  assert.equal(h.catalogReads, 1);
  assert.equal(h.queries[0].sql.match(/count\(\*\)/g)?.length, 12);
});

// The original twelve independent statements, retained as a regression oracle.
const legacyCountQueries = [
  'select count(*) from "notifications" where ("notifications"."user_id" = ? and "notifications"."is_read" = ?)',
  'select count(*) from "onboarding_steps"',
  'select count(*) from "user_onboarding_progress" where ("user_onboarding_progress"."user_id" = ? and "user_onboarding_progress"."completed_at" IS NOT NULL)',
  'select count(*) from "events" where ("events"."user_id" = ? and "events"."status" = ? and "events"."event_date" > ?)',
  'select count(*) from "events" where "events"."user_id" = ?',
  'select count(*) from "equipment" where ("equipment"."user_id" = ? and "equipment"."status" <> ? and (("equipment"."warranty_expiration" is not null and "equipment"."warranty_expiration" <= ?) or ("equipment"."next_maintenance_date" is not null and "equipment"."next_maintenance_date" <= ?)))',
  'select count(*) from "consumable_stock" inner join "consumable_catalog" on "consumable_stock"."catalog_item_id" = "consumable_catalog"."id" where ("consumable_stock"."user_id" = ? and "consumable_stock"."current_quantity" <= "consumable_catalog"."reorder_threshold")',
  'select count(*) from "support_tickets" where ("support_tickets"."user_id" = ? and ("support_tickets"."status" = ? or "support_tickets"."status" = ?))',
  ...["leads", "quotes", "contracts", "invoices"].map(
    (table) => `select count(*) from "${table}" where "${table}"."user_id" = ?`,
  ),
];

test("count SQL retains every predicate and binds all user/date values, even for admins", async () => {
  const h = harness();
  await h.request(userId, undefined, "admin");
  const { sql, params } = h.queries[0];
  const normalized = sql.replace(/\$\d+/g, "?");
  assert.equal(
    normalized,
    `select ${legacyCountQueries.map((query) => `(${query})`).join(", ")} from (select 1) as dashboard_counts`,
  );
  assert.deepEqual(params, [
    userId,
    false,
    userId,
    userId,
    "upcoming",
    now.toISOString(),
    userId,
    userId,
    "retired",
    new Date(now.getTime() + 30 * day).toISOString(),
    new Date(now.getTime() + 14 * day).toISOString(),
    userId,
    userId,
    "open",
    "in_progress",
    userId,
    userId,
    userId,
    userId,
  ]);
});

test("empty dashboard stays numeric and unauthorized requests do no data work", async () => {
  const h = harness();
  assert.deepEqual(await h.request(null), {
    statusCode: 401,
    body: { error: "Unauthorized" },
    headers: { "cache-control": "private, no-store" },
  });
  assert.equal(h.queries.length, 0);
  assert.equal(h.catalogReads, 0);
  assert.deepEqual((await h.request()).body, zeroSummary);
});

function catalogFixture(): PublishedAcademyCatalog {
  return {
    courses: [
      {
        id: "course",
        slug: "course",
        title: { en: "Course", fr: "Cours" },
        description: {},
        category: "business",
        level: "beginner",
        thumbnailUrl: "/course.jpg",
        order: 0,
        isPublished: true,
        totalDurationSeconds: 180,
        instructorName: null,
        isFeatured: false,
        estimatedDuration: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    modules: ["en", "fr"].map((lang, order) => ({
      id: lang,
      courseId: "course",
      title: { en: lang === "en" ? "English" : "French" },
      order,
      createdAt: now,
    })),
    lessons: ["en", "fr"].flatMap((lang) =>
      [0, 1].map((order) => ({
        id: `${lang}-${order}`,
        moduleId: lang,
        title: {
          en: order === 0 ? "Introduction" : "Lesson 1",
          fr: order === 0 ? "Introduction" : "Lecon 1",
        },
        description: null,
        videoUrl: "",
        videoUrls: null,
        thumbnailUrl: null,
        videoAssets: null,
        durationSeconds: 60,
        order,
        isPublished: true,
        notes: null,
        createdAt: now,
      })),
    ),
  };
}

test("warm catalog plus visible progress costs two queries and preserves language/next lesson", async () => {
  const catalog = catalogFixture();
  const before = structuredClone(catalog);
  const h = harness({
    catalog,
    progress: [
      [
        "progress-0",
        userId,
        "fr-0",
        100,
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
      ],
      [
        "progress-1",
        userId,
        "fr-1",
        35,
        null,
        now.toISOString(),
        now.toISOString(),
      ],
    ],
  });
  const { body } = await h.request();
  assert.equal(h.queries.length, 2);
  assert.equal(h.catalogReads, 1);
  assert.equal(body.academyCoursesCompleted, 0);
  assert.equal(body.academyLessonsCompleted, 1);
  assert.equal(body.academyTotalLessons, 2);
  assert.deepEqual(body.nextLesson, {
    lessonId: "fr-1",
    lessonTitle: "Lecon 1",
    courseId: "course",
    courseTitle: "Cours",
    courseThumbnailUrl: "/course.jpg",
    moduleTitle: "French",
    durationSeconds: 60,
    watchPercent: 35,
  });
  assert.deepEqual(h.queries[1].params, [userId, "fr-0", "fr-1"]);
  assert.match(h.queries[1].sql, /"user_lesson_progress"\."user_id" = \$1/);
  assert.deepEqual(catalog, before, "shared catalog must not be mutated");

  const fallback = harness({ catalog });
  const english = await fallback.request(userId, "de");
  assert.deepEqual(fallback.queries[1].params, [userId, "en-0", "en-1"]);
  assert.equal(
    (english.body.nextLesson as { lessonId: string }).lessonId,
    "en-0",
  );
});

test("completed courses and all-completed next lesson remain unchanged", async () => {
  const h = harness({
    catalog: catalogFixture(),
    progress: [0, 1].map((order) => [
      `progress-${order}`,
      userId,
      `en-${order}`,
      100,
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
    ]),
  });
  const { body } = await h.request(userId, "en");
  assert.equal(body.academyCoursesCompleted, 1);
  assert.equal(body.academyLessonsCompleted, 2);
  assert.equal(body.nextLesson, null);
});

test("concurrent dashboards each execute one count statement without sharing user results", async () => {
  const h = harness();
  await Promise.all(
    Array.from({ length: 20 }, (_, index) => h.request(`user-${index}`)),
  );
  assert.equal(h.queries.length, 20);
  assert.equal(h.catalogReads, 20);
  assert.equal(new Set(h.queries.map((query) => query.params[0])).size, 20);
});

test("count failures propagate rather than returning a false zero dashboard", async () => {
  const failure = new Error("test database failure");
  const h = harness({
    execute: async () => {
      throw failure;
    },
  });
  await assert.rejects(
    h.request(),
    (error: unknown) => error instanceof Error && error.cause === failure,
  );
  assert.equal(h.queries.length, 1);
});

function assertLocalDatabase(value: string) {
  const url = new URL(value);
  assert.ok(
    ["postgres:", "postgresql:"].includes(url.protocol),
    "PostgreSQL required",
  );
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Loopback only",
  );
  assert.equal(url.port, "55439", "Isolated test port required");
  assert.ok(url.pathname.length > 1, "Explicit test database required");
  assert.equal(url.search, "", "Connection overrides forbidden");
  assert.equal(url.hash, "", "Fragments forbidden");
}

test("dashboard integration guard rejects production and connection overrides", () => {
  for (const url of [
    "postgresql://example.invalid:55439/test",
    "postgresql://localhost:5432/test",
    "postgresql://localhost:55439/test?host=example.invalid",
    "https://localhost:55439/test",
    "postgresql://localhost:55439/",
    "postgresql://localhost:55439/test#override",
  ])
    assert.throws(() => assertLocalDatabase(url));
  assertLocalDatabase("postgresql://127.0.0.1:55439/dashboard_test");
});

test(
  "real PostgreSQL dashboard counts preserve tenant scoping and boundary semantics",
  {
    skip:
      !process.env.DASHBOARD_TEST_DATABASE_URL &&
      "Set DASHBOARD_TEST_DATABASE_URL for isolated local PostgreSQL",
  },
  async () => {
    const connectionString = process.env.DASHBOARD_TEST_DATABASE_URL!;
    assertLocalDatabase(connectionString);
    const pool = createDatabasePool(connectionString);
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL search_path = pg_temp");
        const definitions: Record<string, string> = {
          notifications: "user_id text, is_read boolean",
          onboarding_steps: "id text",
          user_onboarding_progress:
            "user_id text, completed_at timestamptz, skipped_at timestamptz",
          events: "user_id text, status text, event_date timestamp",
          equipment:
            "user_id text, status text, warranty_expiration timestamp, next_maintenance_date timestamp",
          consumable_catalog: "id uuid, reorder_threshold integer",
          consumable_stock:
            "user_id text, catalog_item_id uuid, current_quantity integer, low_stock_alert_enabled boolean",
          support_tickets: "user_id text, status text",
          leads: "user_id text",
          quotes: "user_id text",
          contracts: "user_id text",
          invoices: "user_id text",
        };
        for (const [table, columns] of Object.entries(definitions))
          await client.query(
            `CREATE TEMP TABLE ${table} (${columns}) ON COMMIT DROP`,
          );
        const execute: Execute = async (sql, params) => {
          const result = await client.query({
            text: sql,
            values: params,
            rowMode: "array",
          });
          return { rows: result.rows };
        };
        assert.deepEqual(
          (await harness({ execute }).request()).body,
          zeroSummary,
        );
        const date = (offset: number) =>
          new Date(now.getTime() + offset).toISOString();
        const catalogId = "11111111-1111-4111-8111-111111111111";
        const fixtures: Record<string, unknown[][]> = {
          notifications: [
            [userId, false],
            [userId, true],
            ["other", false],
          ],
          onboarding_steps: [["one"], ["two"], ["three"]],
          user_onboarding_progress: [
            [userId, date(0), null],
            [userId, date(0), null],
            [userId, null, date(0)],
            ["other", date(0), null],
          ],
          events: [
            [userId, "upcoming", date(1)],
            [userId, "upcoming", date(0)],
            [userId, "upcoming", date(-1)],
            [userId, "active", date(day)],
            [userId, "completed", date(day)],
            [userId, "cancelled", date(day)],
            ["other", "upcoming", date(day)],
          ],
          equipment: [
            [userId, "active", date(30 * day), null],
            [userId, "in_service", null, date(14 * day)],
            [userId, "inactive", date(-day), date(-day)],
            [userId, "retired", date(-day), date(-day)],
            [userId, "active", null, null],
            [userId, "active", date(30 * day + 1), date(14 * day + 1)],
            ["other", "active", date(-day), date(-day)],
          ],
          consumable_catalog: [[catalogId, 2]],
          consumable_stock: [
            [userId, catalogId, 2, false],
            [userId, catalogId, 1, true],
            [userId, catalogId, 3, true],
            ["other", catalogId, 0, true],
            [userId, "22222222-2222-4222-8222-222222222222", 0, true],
          ],
          support_tickets: [
            [userId, "open"],
            [userId, "in_progress"],
            [userId, "resolved"],
            [userId, "closed"],
            ["other", "open"],
          ],
          leads: [[userId], ["other"]],
          quotes: [[userId], [userId], ["other"]],
          contracts: [[userId], [userId], [userId], ["other"]],
          invoices: [[userId], [userId], [userId], [userId], ["other"]],
        };
        for (const [table, rows] of Object.entries(fixtures)) {
          for (const row of rows)
            await client.query(
              `INSERT INTO pg_temp.${table} VALUES (${row.map((_, index) => `$${index + 1}`).join(", ")})`,
              row,
            );
        }
        const h = harness({ execute });
        const summary = (await h.request()).body;
        assert.deepEqual(summary, {
          ...zeroSummary,
          unreadNotifications: 1,
          onboardingPercent: 67,
          upcomingEventsCount: 1,
          totalEventsCount: 6,
          equipmentAlerts: 3,
          lowStockCount: 2,
          openTicketsCount: 2,
          leadsCount: 1,
          quotesCount: 2,
          contractsCount: 3,
          invoicesCount: 4,
        });
        assert.equal(h.queries.length, 1);
        const combined = h.queries[0];
        let parameterOffset = 0;
        const legacyCounts: unknown[] = [];
        for (const query of legacyCountQueries) {
          let count = 0;
          const text = query.replace(/\?/g, () => `$${++count}`);
          const result = await execute(
            text,
            combined.params.slice(parameterOffset, parameterOffset + count),
          );
          parameterOffset += count;
          legacyCounts.push(result.rows[0][0]);
        }
        assert.equal(parameterOffset, combined.params.length);
        assert.deepEqual(
          (await execute(combined.sql, combined.params)).rows[0],
          legacyCounts,
          "one statement must match all twelve original independent PostgreSQL results",
        );
        assert.deepEqual(
          (await h.request(userId, undefined, "admin")).body,
          summary,
        );
        assert.deepEqual((await h.request("empty-user")).body, zeroSummary);
      } finally {
        try {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      }
    } finally {
      await pool.end();
    }
  },
);
