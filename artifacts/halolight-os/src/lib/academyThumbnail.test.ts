import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../pages/AcademyCourse.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness() {
  let language = "en";
  const lesson = {
    id: "lesson", title: "Lesson", order: 0, durationSeconds: 60,
    completedAt: null as string | null, watchPercent: 0,
    thumbnailUrl: "https://cdn.example.com/legacy.jpg",
    videoAssets: { en: { thumbnailUrl: "https://cdn.example.com/thumb.jpg?token=old&expires=1" } } as Record<string, { thumbnailUrl: string }>,
  };
  const course = {
    id: "course", title: "Course", level: "beginner", category: "Training", thumbnailUrl: "",
    modules: [{ id: "module", title: "Module", order: 0, lessons: [lesson] }],
  };
  const deps: Record<string, unknown> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key, i18n: { language } }) },
    wouter: { useParams: () => ({ courseId: "course" }), Link: "a" },
    "@workspace/api-client-react": { useGetCourse: () => ({ data: course }) },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
    "@/lib/apiErrorMessage": { academyErrorMessage: () => "error" },
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", compiled)((id: string) => {
    if (id in deps) return deps[id];
    assert.ok(id.startsWith("@/components/ui/") || id === "lucide-react", id);
    return new Proxy({}, { get: (_, name) => String(name) });
  }, module, module.exports);
  function thumbnailParent(node: any): any {
    if (!node || typeof node !== "object") return undefined;
    const children = [node.props?.children].flat(Infinity);
    if (children.some((child) => child?.type === "img" && child.props.alt === "Lesson")) return node;
    for (const child of children) {
      const result = thumbnailParent(child);
      if (result) return result;
    }
  }
  return {
    lesson,
    setLanguage: (value: string) => { language = value; },
    render: () => thumbnailParent(module.exports.default()),
  };
}

function image(parent: any) {
  return [parent.props.children].flat().find((child) => child?.type === "img");
}

test("failed lesson thumbnail container remounts when its signed src refreshes", () => {
  const h = harness();
  const before = h.render();
  const domParent = { style: { display: "" } };
  image(before).props.onError({ target: { parentElement: domParent } });
  assert.equal(domParent.style.display, "none");
  h.lesson.videoAssets.en.thumbnailUrl = "https://cdn.example.com/thumb.jpg?token=fresh&expires=3601";
  const after = h.render();
  assert.notEqual(after.key, before.key, "a changed src must replace the hidden DOM parent, not reuse it");
  assert.equal(after.key, image(after).props.src);
  assert.equal(after.props.style?.display, undefined);
});

test("language changes replace only the thumbnail container and preserve selected URLs", () => {
  const h = harness();
  const english = h.render();
  h.lesson.videoAssets.fr = { thumbnailUrl: "https://cdn.example.com/fr.jpg?token=fr" };
  h.setLanguage("fr");
  const french = h.render();
  assert.equal(image(french).props.src, h.lesson.videoAssets.fr.thumbnailUrl);
  assert.notEqual(french.key, english.key);
  h.setLanguage("en");
  assert.equal(h.render().key, english.key);
});

test("unchanged URLs retain identity; existing English and legacy selection is unchanged", () => {
  const h = harness();
  const first = h.render();
  assert.equal(h.render().key, first.key);
  h.setLanguage("pl");
  assert.equal(image(h.render()).props.src, h.lesson.videoAssets.en.thumbnailUrl);
  delete h.lesson.videoAssets.en;
  assert.equal(image(h.render()).props.src, h.lesson.thumbnailUrl);
});

test("thumbnail dimensions and completion overlay survive a refreshed URL", () => {
  const h = harness();
  h.lesson.completedAt = "2026-09-27T00:00:00Z";
  const before = h.render();
  h.lesson.videoAssets.en.thumbnailUrl += "&refreshed=1";
  const after = h.render();
  assert.equal(after.props.className, before.props.className);
  assert.match(after.props.className, /h-10 w-16/);
  assert.equal(after.props.children[1].props.className, before.props.children[1].props.className);
  assert.equal(image(after).props.alt, "Lesson");
});
