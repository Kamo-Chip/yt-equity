import { mock } from "node:test";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { testDatabase } from "./database.mjs";

export async function testApp({ getSession } = {}) {
  process.env.NODE_ENV = "test";
  const { pg, db, schema } = await testDatabase();
  mock.module("@yt-equity/db", { namedExports: { ...schema, db, and, asc, desc, eq, ilike, or } });
  mock.module("@yt-equity/db/client", { namedExports: { db, pool: { end: () => pg.close() } } });
  mock.module(new URL("../../src/auth.ts", import.meta.url).href, { namedExports: { auth: {
    api: {
      getSession: getSession ?? (async ({ headers }) => headers["x-test-role"] ? { user: { id: "test-user", email: "reviewer@example.com", role: headers["x-test-role"] } } : null),
      signInMagicLink: async () => ({ status: true }),
    },
  } } });
  const { buildApp } = await import("../../src/app.ts");
  return { app: await buildApp(), pg, db, schema };
}
