import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

function runLogger(source: string, nodeEnv = "production") {
  const loggerUrl = new URL("./logger.ts", import.meta.url).href;
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `
      (async () => {
      const { logger } = await import(${JSON.stringify(loggerUrl)});
      const { DrizzleQueryError } = await import("drizzle-orm");
      const cause = Object.assign(new Error("Tenant/user postgres.private-ref not found"), {
        code: "XX000", detail: "private-detail", connectionString: "postgres://private-password@host/db",
      });
      const err = new DrizzleQueryError("SELECT secret_column FROM users WHERE email = $1", ["private@example.invalid"], cause);
      ${source}
      await new Promise((resolve, reject) => logger.flush((error) => error ? reject(error) : resolve()));
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `,
    ],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, NODE_ENV: nodeEnv, LOG_LEVEL: "info" },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

function assertNoErrorDetails(output: string) {
  assert.doesNotMatch(
    output,
    /private-ref|private-detail|private-password|private@example|SELECT|secret_column|Failed query|"(?:params|query|cause|stack)"/,
  );
}

test("the shared logger and its children classify automation errors without serializing SQL or causes", () => {
  const output = runLogger(`
    logger.error({ err }, "Initial automation run failed");
    logger.child({ component: "automation" }).error({ err }, "Scheduled automation run failed");
    logger.warn({ err: new Error("Outer wrapper", { cause: err }) }, "Evaluator error");
    logger.error({ err: new DrizzleQueryError("SELECT secret_column", ["private@example.invalid"], new Error("private-detail")) }, "Action handler error");
  `);
  assertNoErrorDetails(output);
  const records = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((record) => record.err),
    [
      { code: "DATABASE_UNAVAILABLE" },
      { code: "DATABASE_UNAVAILABLE" },
      { code: "DATABASE_UNAVAILABLE" },
      { code: "INTERNAL_SERVER_ERROR" },
    ],
  );
  assert.equal(records[1].component, "automation");
  assert.equal(records[0].msg, "Initial automation run failed");
  assert.equal(records[1].msg, "Scheduled automation run failed");
});

test("omitting a log message cannot copy a Drizzle error's SQL into the message field", () => {
  const output = runLogger(`
    logger.error({ err });
    logger.error(err);
    logger.child({ component: "automation" }).warn({ err });
  `);
  assertNoErrorDetails(output);
  const records = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.deepEqual(record.err, { code: "DATABASE_UNAVAILABLE" });
    assert.equal(record.msg, "Operation failed");
  }
});

test("development pretty logging also strips database error details", () => {
  const output = runLogger(
    `
    logger.error({ err }, "Scheduled automation run failed");
    logger.error({ err });
  `,
    "development",
  );
  assertNoErrorDetails(output);
  assert.match(output, /DATABASE_UNAVAILABLE/);
  assert.match(output, /Scheduled automation run failed/);
  assert.match(output, /Operation failed/);
});

test("shared logger preserves existing credential-header redaction and ordinary messages", () => {
  const output = runLogger(`
    logger.info({ req: { headers: { authorization: "private-password", cookie: "private-password" } }, res: { headers: { "set-cookie": "private-password" } } }, "Headers redacted");
    logger.info({ port: 8080 }, "Server listening on %s", "test port");
  `);
  assertNoErrorDetails(output);
  const records = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records[0].req.headers.authorization, "[Redacted]");
  assert.equal(records[0].req.headers.cookie, "[Redacted]");
  assert.equal(records[0].res.headers["set-cookie"], "[Redacted]");
  assert.equal(records[1].msg, "Server listening on test port");
  assert.equal(records[1].port, 8080);
});
