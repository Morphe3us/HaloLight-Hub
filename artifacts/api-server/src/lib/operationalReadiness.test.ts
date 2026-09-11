import assert from "node:assert/strict";
import test from "node:test";
import { operationalReadiness } from "./operationalReadiness";
import { resolveAIProvider } from "./ai/factory";
import { MockAIProvider } from "./ai/mock";
import { OpenAIProvider } from "./ai/openai";
import { ClaudeProvider } from "./ai/claude";
import { publishedLegalDocuments } from "./userConsentPolicy";
import { buildTicketMail, type TicketMailSnapshot } from "./mail/ticketMessage";

test("AI configuration follows factory selection without activating its singleton", () => {
  const cases: Array<[Record<string, string>, string]> = [
    [{ NODE_ENV: "production" }, "disabled"], [{}, "demo"],
    [{ NODE_ENV: "production", AI_PROVIDER: "mock" }, "demo"],
    [{ AI_PROVIDER: "unknown", OPENAI_API_KEY: "fixture" }, "misconfigured"],
    [{ AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "fixture" }, "misconfigured"],
    [{ AI_PROVIDER: "claude", OPENAI_API_KEY: "fixture" }, "misconfigured"],
    [{ AI_PROVIDER: " OPENAI ", OPENAI_API_KEY: "fixture" }, "configured_unverified"],
    [{ AI_PROVIDER: "claude", ANTHROPIC_API_KEY: "fixture" }, "configured_unverified"],
    [{ OPENAI_API_KEY: "fixture", ANTHROPIC_API_KEY: "fixture" }, "configured_unverified"],
    [{ OPENAI_API_KEY: "  ", ANTHROPIC_API_KEY: "fixture" }, "configured_unverified"],
    [{ NODE_ENV: "production", OPENAI_API_KEY: "  " }, "disabled"],
  ];
  for (const [env, status] of cases) {
    const actual = operationalReadiness(env).ai;
    assert.equal(actual.status, status);
    // Constructors are local only. Never call getAIProvider, completion or streaming.
    const provider = resolveAIProvider(env);
    assert.equal(actual.demoMode, provider instanceof MockAIProvider);
    assert.equal(actual.status === "configured_unverified", provider instanceof OpenAIProvider || provider instanceof ClaudeProvider);
  }
});

test("mail and legal report configuration only with matching runtime validation", () => {
  const configured = {
    SUPPORT_MAIL_ENABLED: "true", SUPPORT_MAIL_PROVIDER: "resend", RESEND_API_KEY: "fixture",
    SUPPORT_MAIL_FROM: "sender@example.invalid", HUB_PUBLIC_URL: "https://hub.example.invalid",
    LEGAL_CONSENT_ENABLED: "true", LEGAL_TERMS_VERSION: "v1", LEGAL_PRIVACY_VERSION: "v1",
    LEGAL_TERMS_URL: "https://legal.example.invalid/terms", LEGAL_PRIVACY_URL: "https://legal.example.invalid/privacy",
  };
  assert.equal(operationalReadiness(configured).mail.status, "configured_unverified");
  assert.equal(operationalReadiness(configured).legal.status, "configured_unverified");
  for (const field of Object.keys(configured)) {
    const env = { ...configured, [field]: " " };
    const report = operationalReadiness(env);
    if (field.startsWith("LEGAL")) assert.equal(report.legal.status === "configured_unverified", !!publishedLegalDocuments(env));
    else assert.notEqual(report.mail.status, "configured_unverified");
  }
  assert.equal(operationalReadiness({}).mail.status, "disabled");
  assert.equal(operationalReadiness({}).legal.status, "disabled");
  assert.equal(operationalReadiness({ ...configured, SUPPORT_MAIL_PROVIDER: "other" }).mail.status, "misconfigured");
  const snapshot = { attachments: [] } as unknown as TicketMailSnapshot;
  for (const origin of ["https://hub.example.invalid", "https://hub.example.invalid/path", "http://hub.example.invalid", "https://user:password@hub.example.invalid", "https://hub.example.invalid?x=y", "not-a-url"]) {
    const report = operationalReadiness({ ...configured, HUB_PUBLIC_URL: origin });
    let valid = true;
    try { buildTicketMail(snapshot, configured.SUPPORT_MAIL_FROM, origin); } catch { valid = false; }
    assert.equal(report.mail.hubOriginValid, valid);
  }
  for (const sender of ["sender@example.invalid", "Name <sender@example.invalid>", "bad", " sender@example.invalid", "x\ny@example.invalid"]) {
    let valid = true;
    try { buildTicketMail(snapshot, sender, configured.HUB_PUBLIC_URL); } catch { valid = false; }
    assert.equal(operationalReadiness({ ...configured, SUPPORT_MAIL_FROM: sender }).mail.senderValid, valid);
  }
  for (const url of ["https://example.invalid/path", "http://example.invalid", "https://user:password@example.invalid", "bad", " "]) {
    const env = { ...configured, LEGAL_TERMS_URL: url };
    assert.equal(operationalReadiness(env).legal.status === "configured_unverified", !!publishedLegalDocuments(env));
  }
});

test("projection has a fixed allowlist and never returns configuration values", () => {
  const env = {
    NODE_ENV: "production", AI_PROVIDER: "openai", OPENAI_API_KEY: "secret-openai-sentinel",
    OPENAI_MODEL: "secret-model-sentinel", ANTHROPIC_API_KEY: "secret-claude-sentinel",
    SUPPORT_MAIL_ENABLED: "true", SUPPORT_MAIL_PROVIDER: "resend", RESEND_API_KEY: "secret-mail-sentinel",
    SUPPORT_MAIL_FROM: "secret-sender@example.invalid", HUB_PUBLIC_URL: "https://secret-hub.example.invalid",
    LEGAL_CONSENT_ENABLED: "true", LEGAL_TERMS_VERSION: "secret-terms-version", LEGAL_PRIVACY_VERSION: "secret-privacy-version",
    LEGAL_TERMS_URL: "https://secret-terms.example.invalid", LEGAL_PRIVACY_URL: "https://secret-privacy.example.invalid",
    DATABASE_URL: "postgresql://secret-db", PRIVATE_STORAGE_DIR: "/secret-path",
  };
  const report = operationalReadiness(env);
  assert.deepEqual(Object.keys(report), ["configurationOnly", "externalChecksPerformed", "ai", "mail", "legal"]);
  assert.deepEqual(Object.keys(report.ai), ["status", "providerSelectionValid", "selectedCredentialPresent", "demoMode", "realProviderSelected"]);
  assert.deepEqual(Object.keys(report.mail), ["status", "enabled", "supportedProvider", "credentialPresent", "senderValid", "hubOriginValid"]);
  assert.deepEqual(Object.keys(report.legal), ["status", "enabled", "versionsPresent", "urlsValid"]);
  for (const section of [report.ai, report.mail, report.legal]) {
    for (const [key, value] of Object.entries(section)) if (key !== "status") assert.equal(typeof value, "boolean");
  }
  assert.equal(report.configurationOnly, true); assert.equal(report.externalChecksPerformed, false);
  assert.doesNotMatch(JSON.stringify(report), /secret|https?:|postgresql:|example\.invalid/);
});
