import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { validateEnvironment } from "./validate-env.mjs";

const production = {
  NODE_ENV: "production",
  MEDIA_PUBLIC_ORIGIN: "https://yt-equity-media.example.workers.dev",
  MEDIA_UPLOAD_SECRET: "a-separate-persistent-media-secret-32-characters-long",
  DATABASE_URL: "postgresql://user:private-password@db.example.com/db?sslmode=require",
  WEB_ORIGIN: "https://www.ytequity.com",
  BETTER_AUTH_URL: "https://www.ytequity.com",
  API_PROXY_SECRET: "separate-persistent-proxy-secret-32-characters-long",
  BETTER_AUTH_SECRET: "a-persistent-production-secret-32-characters-long",
  RESEND_API_KEY: "private-email-key",
  RESEND_FROM: "YT Equity <hello@mail.ytequity.com>",
  API_INTERNAL_URL: "http://api.railway.internal:4000",
};

test("private HTTP upstream and public HTTPS auth origin pass production validation", () => {
  validateEnvironment("api", production);
  validateEnvironment("web", production);
  validateEnvironment("web", { NODE_ENV: "development" });
});

test("production cannot silently fall back to localhost or missing email delivery", () => {
  for (const key of ["API_PROXY_SECRET", "WEB_ORIGIN", "BETTER_AUTH_URL", "RESEND_API_KEY", "RESEND_FROM", "DATABASE_URL", "BETTER_AUTH_SECRET", "MEDIA_PUBLIC_ORIGIN", "MEDIA_UPLOAD_SECRET"]) {
    assert.throws(() => validateEnvironment("api", { ...production, [key]: "" }), new RegExp(key));
  }
  assert.throws(() => validateEnvironment("web", { ...production, API_INTERNAL_URL: "" }), /API_INTERNAL_URL/);
  assert.throws(() => validateEnvironment("api", { ...production, WEB_ORIGIN: "http://localhost:3000" }), /HTTPS/);
});

test("auth cannot move session verification to the API domain or a test sender", () => {
  assert.throws(() => validateEnvironment("api", { ...production, BETTER_AUTH_URL: "https://api.ytequity.com" }), /must match/);
  assert.throws(() => validateEnvironment("api", { ...production, RESEND_FROM: "YT Equity <onboarding@resend.dev>" }), /verified sender/);
  assert.throws(() => validateEnvironment("api", { ...production, BETTER_AUTH_SECRET: "replace-with-a-long-random-secret" }), /random secret/);
});

test("CLI rejects malformed private URL without leaking credentials", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-env.mjs", "web"], {
    env: { ...process.env, ...production, API_INTERNAL_URL: "http://user:private-password@api.internal:4000" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /API_INTERNAL_URL/);
  assert.doesNotMatch(result.stderr, /private-password|private-email-key/);
});

test("both services require a strong independent proxy key", () => {
  for (const service of ["api", "web"]) {
    for (const value of ["", "short", "replace-with-a-separate-long-random-secret"])
      assert.throws(() => validateEnvironment(service, { ...production, API_PROXY_SECRET: value }), /API_PROXY_SECRET/);
  }
});

test("media uploads require a Worker origin and a strong private key", () => {
  for (const value of ["https://example.com", "https://media.workers.dev/path", "http://media.workers.dev"])
    assert.throws(() => validateEnvironment("api", { ...production, MEDIA_PUBLIC_ORIGIN: value }), /MEDIA_PUBLIC_ORIGIN/);
  assert.throws(() => validateEnvironment("api", { ...production, MEDIA_UPLOAD_SECRET: "short" }), /MEDIA_UPLOAD_SECRET/);
});
