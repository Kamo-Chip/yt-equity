import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { testDatabase, migrationsFolder, journal } from "./helpers/database.mjs";
const { generateDrizzleJson, generateMigration, pushSchema } = createRequire(new URL("../../../packages/db/package.json", import.meta.url))("drizzle-kit/api");

async function assertCurrent(database) {
  const { rows } = await database.pg.query("SELECT to_regclass('public.disputes') AS disputes");
  assert.equal(rows[0].disputes, null);
  assert.equal((await database.pg.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, journal.entries.length);
  const snapshot = JSON.parse(await readFile(join(migrationsFolder, "meta/0007_snapshot.json"), "utf8"));
  const current = generateDrizzleJson(database.schema, snapshot.id, ["public"]);
  assert.deepEqual(await generateMigration(snapshot, current), [], "generation must not repeat migrated columns or role renames");
  const drift = await pushSchema(database.schema, database.db);
  assert.deepEqual(drift.statementsToExecute, [], "the migrated database must match the application schema");
}
test("fresh journaled migration matches the schema and repeated migration is a no-op", async () => {
  const database = await testDatabase();
  try { await database.upgrade(); await assertCurrent(database); }
  finally { await database.pg.close(); }
});
test("cleanup upgrades existing data, discards retired disputes, and removes duplicated payload fields", async () => {
  const database = await testDatabase(6);
  const { db, schema, pg } = database;
  try {
    const [channel] = await db.insert(schema.channels).values({ channelId: "UCmigration", handle: "@migration", name: "Migration", easterEgg: "creator" }).returning();
    const [firm] = await db.insert(schema.firms).values({ name: "Migration firm", profilePictureUrl: "https://example.com/logo.png", profilePictureBackground: "#171717" }).returning();
    const [claim] = await db.insert(schema.claims).values({ channelId: channel.id, firmId: firm.id, type: "funding", published: true, status: "confirmed" }).returning();
    await db.insert(schema.evidence).values({ claimId: claim.id, url: "https://example.com/evidence", tier: "official" });
    await db.insert(schema.channelAliases).values({ channelId: channel.id, alias: "@previous" });
    const [submission] = await db.insert(schema.submissions).values({ kind: "dispute", channelId: channel.channelId, contactEmail: "reader@example.com", payload: { kind: "dispute", channelId: channel.channelId, contactEmail: "reader@example.com", claimId: claim.id, explanation: "Keep the explanation", sources: ["https://example.com/source"] } }).returning();
    await db.insert(schema.moderationDecisions).values({ submissionId: submission.id, moderatorId: "reviewer", decision: "approved" });
    await db.insert(schema.auditEvents).values({ actorId: "reviewer", action: "approved", entityType: "submission", entityId: submission.id });
    await pg.query('INSERT INTO disputes (claim_id, submission_id, explanation) VALUES ($1, $2, $3)', [claim.id, submission.id, "Retired data"]);
    const tables = [schema.channels, schema.firms, schema.claims, schema.evidence, schema.channelAliases, schema.moderationDecisions, schema.auditEvents];
    const before = await Promise.all(tables.map(table => db.select().from(table)));
    await database.upgrade();
    assert.deepEqual(await Promise.all(tables.map(table => db.select().from(table))), before);
    const [saved] = await db.select().from(schema.submissions);
    assert.deepEqual(saved, { ...submission, payload: { claimId: claim.id, explanation: "Keep the explanation", sources: ["https://example.com/source"] } });
    await assertCurrent(database);
  } finally { await pg.close(); }
});
