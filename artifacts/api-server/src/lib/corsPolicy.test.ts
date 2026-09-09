import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedCorsOrigins, isCorsOriginAllowed } from "./corsPolicy";

test("getAllowedCorsOrigins reads explicit origins and app URL", () => {
  const allowed = getAllowedCorsOrigins({
    NODE_ENV: "production",
    API_ALLOWED_ORIGINS: "https://admin.example.com, https://app.example.com/",
    APP_PUBLIC_URL: "https://portal.example.com/",
  } as NodeJS.ProcessEnv);

  assert.equal(isCorsOriginAllowed("https://admin.example.com", allowed), true);
  assert.equal(isCorsOriginAllowed("https://app.example.com", allowed), true);
  assert.equal(
    isCorsOriginAllowed("https://portal.example.com", allowed),
    true,
  );
  assert.equal(isCorsOriginAllowed("https://evil.example.com", allowed), false);
});

test("isCorsOriginAllowed allows server-to-server requests without origin", () => {
  assert.equal(isCorsOriginAllowed(undefined, new Set()), true);
});
