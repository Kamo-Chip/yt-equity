import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { validateEnvironment } from "./validate-env.mjs";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:private-password@db.example.com/db?sslmode=require",
  WEB_ORIGIN: "https://www.ytequity.com",
  BETTER_AUTH_URL: "https://www.ytequity.com",
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
  for (const key of ["WEB_ORIGIN", "BETTER_AUTH_URL", "RESEND_API_KEY", "RESEND_FROM", "DATABASE_URL", "BETTER_AUTH_SECRET"]) {
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
