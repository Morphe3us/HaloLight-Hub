import assert from "node:assert/strict";
import test from "node:test";
import { SubmitQuizBody, UpdateLessonProgressBody } from "@workspace/api-zod";

test("lesson progress rejects malformed values and truthy string completion", () => {
  for (const body of [undefined, null, {}, { watchPercent: null }, { watchPercent: "50" }, { watchPercent: -1 }, { watchPercent: 101 }, { watchPercent: 1.5 }, { watchPercent: 50, completed: "false" }]) {
    assert.equal(UpdateLessonProgressBody.safeParse(body).success, false);
  }
  assert.equal(UpdateLessonProgressBody.safeParse({ watchPercent: 50, completed: false }).success, true);
});

test("quiz input rejects missing, malformed and excessive answers before reading the database", () => {
  for (const body of [undefined, null, {}, { answers: "0" }, { answers: [null] }, { answers: [-2] }, { answers: [0.5] }, { answers: Array(201).fill(0) }]) {
    assert.equal(SubmitQuizBody.safeParse(body).success, false);
  }
  assert.equal(SubmitQuizBody.safeParse({ answers: [0, -1, 2] }).success, true);
});
