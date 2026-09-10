import assert from "node:assert/strict";
import test from "node:test";
import { hasCurrentAcceptance, parseAcceptance, publishedLegalDocuments } from "./userConsentPolicy";
import { dashboardWidgets, parseDashboardPatch } from "./userDashboardPreferences";

const config = {
  LEGAL_CONSENT_ENABLED: "true", LEGAL_TERMS_VERSION: "fixture-terms-v1",
  LEGAL_PRIVACY_VERSION: "fixture-privacy-v1",
  LEGAL_TERMS_URL: "https://legal.example.test/terms/v1",
  LEGAL_PRIVACY_URL: "https://legal.example.test/privacy/v1",
};

test("disabled legal configuration has no documents and invalid enabled documents are rejected", () => {
  assert.equal(publishedLegalDocuments({}), null);
  assert.equal(publishedLegalDocuments({ LEGAL_CONSENT_ENABLED: "true" }), null);
  for (const url of ["javascript:alert(1)", "http://example.test", "https://user:pass@example.test"])
    assert.equal(publishedLegalDocuments({ ...config, LEGAL_TERMS_URL: url }), null);
});

test("mandatory explicit acceptance is version-bound and never implies optional consent", () => {
  const docs = publishedLegalDocuments(config)!;
  assert.ok(docs);
  const input = { accepted: true, ...docs };
  assert.deepEqual(parseAcceptance(input, docs), { marketing: false, analytics: false, aiImprovement: false });
  assert.equal(parseAcceptance({ ...input, accepted: "true" }, docs), null);
  assert.equal(parseAcceptance({ ...input, termsVersion: "old" }, docs), null);
  assert.equal(parseAcceptance({ ...input, marketing: "yes" }, docs), null);
  assert.equal(parseAcceptance({ ...input, termsUrl: "https://legal.example.test/old" }, docs), null);
  assert.equal(parseAcceptance({ ...input, privacyUrl: undefined }, docs), null);
  assert.ok(hasCurrentAcceptance(docs, docs));
  assert.equal(hasCurrentAcceptance({ ...docs, privacyVersion: "v2" }, docs), false);
  assert.equal(hasCurrentAcceptance({ ...docs, termsUrl: "https://legal.example.test/terms/v2" }, docs), false);
});

test("widget preferences accept only the six boolean keys, retaining explicit false", () => {
  assert.equal(dashboardWidgets({ next_lesson: false }).next_lesson, false);
  assert.equal(dashboardWidgets({ onboarding: "false" }).onboarding, true);
  assert.deepEqual(parseDashboardPatch({ notifications: false }), { notifications: false });
  for (const value of [{ userId: "other" }, { next_lesson: 0 }, [], null, {}])
    assert.equal(parseDashboardPatch(value), null);
});
