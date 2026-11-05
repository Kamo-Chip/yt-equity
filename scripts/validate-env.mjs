import { pathToFileURL } from "node:url";

/** Validate without printing configuration values or credentials. */
export function validateEnvironment(service, env = process.env) {
  if (!["api", "web"].includes(service)) throw new Error("Expected service api or web");
  if (env.NODE_ENV !== "production") return;
  const required = service === "api"
    ? ["API_PROXY_SECRET", "DATABASE_URL", "WEB_ORIGIN", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "RESEND_API_KEY", "RESEND_FROM", "MEDIA_PUBLIC_ORIGIN", "MEDIA_UPLOAD_SECRET"]
    : ["API_PROXY_SECRET", "WEB_ORIGIN", "API_INTERNAL_URL"];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(", ")}`);
  for (const key of service === "api" ? ["WEB_ORIGIN", "BETTER_AUTH_URL"] : ["WEB_ORIGIN", "API_INTERNAL_URL"]) {
    let url;
    try { url = new URL(env[key]); } catch { throw new Error(`${key} must be a valid URL`); }
    if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error(`${key} must be an HTTP origin without credentials, path, query or fragment`);
    }
    if (key !== "API_INTERNAL_URL" && url.protocol !== "https:") throw new Error(`${key} must use HTTPS in production`);
  }
  if (env.API_PROXY_SECRET.length < 32 || env.API_PROXY_SECRET.startsWith("replace-")) throw new Error("API_PROXY_SECRET must be the same persistent random secret of at least 32 characters on web and api");
  if (service === "api") {
    if (!/^https:\/\/[\w.-]+\.workers\.dev$/.test(env.MEDIA_PUBLIC_ORIGIN)) throw new Error("MEDIA_PUBLIC_ORIGIN must be a Worker HTTPS origin");
    if (env.MEDIA_UPLOAD_SECRET.length < 32 || env.MEDIA_UPLOAD_SECRET.startsWith("replace-")) throw new Error("MEDIA_UPLOAD_SECRET must be a persistent random secret of at least 32 characters");
    if (new URL(env.BETTER_AUTH_URL).origin !== new URL(env.WEB_ORIGIN).origin) {
      throw new Error("BETTER_AUTH_URL must match WEB_ORIGIN for same-origin authentication");
    }
    if (env.BETTER_AUTH_SECRET.length < 32 || env.BETTER_AUTH_SECRET.startsWith("replace-")) {
      throw new Error("BETTER_AUTH_SECRET must be a persistent random secret of at least 32 characters");
    }
    let database;
    try { database = new URL(env.DATABASE_URL); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL"); }
    if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
    if (/@(?:onboarding\.)?resend\.dev\b/i.test(env.RESEND_FROM)) throw new Error("RESEND_FROM must use a verified sender domain");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { validateEnvironment(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
