import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import {
  lessonResources,
  quizAttempts,
  quizQuestions,
  userLessonProgress,
} from "@workspace/db/schema";
import { SubmitQuizBody, UpdateLessonProgressBody } from "@workspace/api-zod";
import * as academyAccess from "./academyAccess";
import * as academyLanguage from "./academyLanguage";
import * as localizedPlayback from "./localizedPlayback";
import type { PublishedAcademyCatalog } from "./academyCatalog";

const lessonId = "11111111-1111-4111-8111-111111111111";
const endpoints = [
  { method: "GET", path: "/academy/lessons/:id", body: undefined },
  {
    method: "PATCH",
    path: "/academy/lessons/:id/progress",
    body: { watchPercent: 50, completed: false },
  },
  {
    method: "POST",
    path: "/academy/lessons/:id/quiz",
    body: { answers: [0] },
  },
] as const;
type Endpoint = (typeof endpoints)[number];
type Request = {
  params: { id: string };
  query: { lang: string };
  body: unknown;
};
type Response = {
  statusCode: number;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
  status(code: number): Response;
  json(body: Record<string, unknown>): Response;
  setHeader(name: string, value: string): void;
};
type Handler = (
  request: Request,
  response: Response,
  next: () => void,
) => void | Promise<void>;

function publishedCatalog(): PublishedAcademyCatalog {
  const createdAt = new Date("2026-01-01T00:00:00Z");
  return {
    courses: [
      {
        id: "course",
        slug: "course",
        title: { en: "Course" },
        description: {},
        category: "business",
        level: "beginner",
        thumbnailUrl: "",
        order: 1,
        isPublished: true,
        totalDurationSeconds: 60,
        instructorName: null,
        isFeatured: false,
        estimatedDuration: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    modules: [
      {
        id: "english",
        courseId: "course",
        title: { en: "English" },
        order: 1,
        createdAt,
      },
      {
        id: "french",
        courseId: "course",
        title: { en: "French" },
        order: 2,
        createdAt,
      },
    ],
    lessons: [
      {
        id: lessonId,
        moduleId: "english",
        title: { en: "Lesson" },
        description: null,
        videoUrl: "",
        videoUrls: null,
        thumbnailUrl: null,
        videoAssets: null,
        durationSeconds: 60,
        order: 1,
        isPublished: true,
        notes: null,
        createdAt,
      },
    ],
  };
}

const routeCode = transformSync(
  readFileSync(new URL("../routes/academy.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "cjs" },
).code;

function setupRoutes(
  snapshots: PublishedAcademyCatalog[],
  role: string | null = "client",
) {
  let catalogReads = 0;
  let playbackCalls = 0;
  const selectCalls: unknown[] = [];
  const insertCalls: Array<{
    table: unknown;
    values: Record<string, unknown>;
  }> = [];
  const routes = new Map<string, Handler[]>();
  const middleware: Array<{ path: string; handlers: Handler[] }> = [];
  const register =
    (method: string) =>
    (path: string, ...handlers: Handler[]) => {
      routes.set(`${method} ${path}`, handlers);
    };
  const router = {
    use: (path: string, ...handlers: Handler[]) =>
      middleware.push({ path, handlers }),
    get: register("GET"),
    patch: register("PATCH"),
    post: register("POST"),
  };
  const question = {
    id: "question",
    lessonId,
    question: { en: "Ready?" },
    options: [{ en: "Yes" }, { en: "No" }],
    correctOption: 0,
    order: 1,
  };
  const db = {
    select: () => ({
      from(table: unknown) {
        selectCalls.push(table);
        const rows = Promise.resolve(table === quizQuestions ? [question] : []);
        return { where: () => Object.assign(rows, { orderBy: () => rows }) };
      },
    }),
    insert: (table: unknown) => ({
      values(values: Record<string, unknown>) {
        insertCalls.push({ table, values });
        return Object.assign(Promise.resolve(), {
          onConflictDoUpdate: () => ({ returning: async () => [values] }),
        });
      },
    }),
  };
  const dependencies: Record<string, unknown> = {
    express: { Router: () => router },
    "drizzle-orm": drizzle,
    "@workspace/db": {
      db,
      lessonResources,
      quizQuestions,
      userLessonProgress,
      quizAttempts,
    },
    "@workspace/api-zod": { SubmitQuizBody, UpdateLessonProgressBody },
    "../middlewares/requireAuth": {
      requireAuth: (_req: Request, _res: Response, next: () => void) => next(),
    },
    "../lib/userSync": {
      getOrCreateUser: async () =>
        role ? { id: "user", role, language: "en" } : null,
    },
    "../lib/academyAccess": academyAccess,
    "../lib/academyLanguage": academyLanguage,
    "../lib/localizedPlayback": localizedPlayback,
    "../lib/bunnyPlaybackVerification": {
      verifyBunnyPlaybackProtection: async () => {},
    },
    "../lib/academyCatalog": {
      getPublishedAcademyCatalog: async () => {
        const index = Math.min(catalogReads++, snapshots.length - 1);
        return structuredClone(snapshots[index]);
      },
    },
    "../lib/bunnySecurity": {
      BunnyPlaybackConfigurationError: class extends Error {},
      isBunnyPlaybackUrl: () => false,
      secureLessonPlayback: (playback: unknown) => {
        playbackCalls++;
        return playback;
      },
      thumbnailOnlyVideoAssets: () => null,
    },
  };
  const module = { exports: {} };
  // No fallback require: new dependencies cannot accidentally initialize a real DB or service.
  new Function("require", "module", "exports", routeCode)(
    (name: string) => {
      assert.ok(
        Object.hasOwn(dependencies, name),
        `Unmocked route dependency: ${name}`,
      );
      return dependencies[name];
    },
    module,
    module.exports,
  );

  return {
    selectCalls,
    insertCalls,
    get catalogReads() {
      return catalogReads;
    },
    get playbackCalls() {
      return playbackCalls;
    },
    async request(
      endpoint: Endpoint,
      options: { body?: unknown; lang?: string } = {},
    ) {
      const response: Response = {
        statusCode: 200,
        body: undefined,
        headers: {},
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
        setHeader(name, value) {
          this.headers[name.toLowerCase()] = value;
        },
      };
      const request: Request = {
        params: { id: lessonId },
        query: { lang: options.lang ?? "en" },
        body: Object.hasOwn(options, "body") ? options.body : endpoint.body,
      };
      const handlers = routes.get(`${endpoint.method} ${endpoint.path}`);
      assert.ok(handlers, "expected route is registered");
      const matchingMiddleware = middleware
        .filter(({ path }) => endpoint.path.startsWith(path))
        .flatMap(({ handlers }) => handlers);
      for (const handler of [...matchingMiddleware, ...handlers]) {
        let nextCalled = false;
        await handler(request, response, () => {
          nextCalled = true;
        });
        if (!nextCalled) break;
      }
      assert.notEqual(response.body, undefined, "route must send a response");
      assert.equal(response.headers["cache-control"], "private, no-store");
      return response;
    },
  };
}

for (const endpoint of endpoints) {
  test(`${endpoint.method} lesson access uses one catalog snapshot and observes unpublishing on the next request`, async () => {
    const published = publishedCatalog();
    const unpublished = { ...published, lessons: [] };
    const routes = setupRoutes([published, unpublished]);
    const allowed = await routes.request(endpoint);
    assert.equal(allowed.statusCode, 200);
    assert.equal(
      routes.catalogReads,
      1,
      "publication and language must use the same snapshot",
    );
    if (endpoint.method === "GET") {
      assert.equal(allowed.body?.id, lessonId);
      assert.equal(routes.insertCalls.length, 0);
    } else {
      assert.equal(
        routes.insertCalls.length,
        1,
        "successful writes are recorded only in memory",
      );
      assert.equal(routes.insertCalls[0]!.values.lessonId, lessonId);
    }

    const beforeDenied = [
      routes.selectCalls.length,
      routes.insertCalls.length,
      routes.playbackCalls,
    ];
    const denied = await routes.request(endpoint);
    assert.equal(denied.statusCode, 404);
    assert.deepEqual(denied.body, { error: "Lesson not found" });
    assert.equal(
      routes.catalogReads,
      2,
      "each request reads exactly one catalog snapshot",
    );
    assert.deepEqual(
      [
        routes.selectCalls.length,
        routes.insertCalls.length,
        routes.playbackCalls,
      ],
      beforeDenied,
      "unpublished requests must not query, insert, or resolve playback",
    );
  });

  for (const role of ["client", "admin"]) {
    test(`${endpoint.method} rejects draft lessons, draft courses, and wrong-language lessons for ${role}`, async () => {
      for (const reason of ["draft lesson", "draft course", "wrong language"]) {
        const catalog = publishedCatalog();
        if (reason === "draft lesson") catalog.lessons[0]!.isPublished = false;
        if (reason === "draft course") catalog.courses[0]!.isPublished = false;
        const routes = setupRoutes([catalog], role);
        const response = await routes.request(endpoint, {
          lang: reason === "wrong language" ? "fr" : "en",
        });
        assert.equal(response.statusCode, 404, reason);
        assert.deepEqual(response.body, { error: "Lesson not found" });
        assert.equal(routes.catalogReads, 1);
        assert.equal(routes.selectCalls.length, 0);
        assert.equal(routes.insertCalls.length, 0);
        assert.equal(routes.playbackCalls, 0);
      }
    });
  }

  test(`${endpoint.method} unauthorized responses are private and no-store`, async () => {
    const routes = setupRoutes([publishedCatalog()], null);
    const response = await routes.request(endpoint);
    assert.equal(response.statusCode, 401);
    assert.equal(routes.catalogReads, 0);
    assert.equal(routes.selectCalls.length, 0);
    assert.equal(routes.insertCalls.length, 0);
  });
}

test("malformed progress and quiz bodies return no-store 400 before catalog access or DB calls", async () => {
  const cases = [
    {
      endpoint: endpoints[1],
      bodies: [
        undefined,
        null,
        {},
        { watchPercent: "50" },
        { watchPercent: 50, completed: "false" },
      ],
    },
    {
      endpoint: endpoints[2],
      bodies: [undefined, null, {}, { answers: "0" }, { answers: [null] }],
    },
  ];
  for (const { endpoint, bodies } of cases) {
    for (const body of bodies) {
      const routes = setupRoutes([publishedCatalog()]);
      const response = await routes.request(endpoint, { body });
      assert.equal(response.statusCode, 400);
      assert.equal(typeof response.body?.error, "string");
      assert.equal(routes.catalogReads, 0);
      assert.equal(routes.selectCalls.length, 0);
      assert.equal(routes.insertCalls.length, 0);
      assert.equal(routes.playbackCalls, 0);
    }
  }
});
