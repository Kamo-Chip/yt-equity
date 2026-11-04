import { seedCreatorChannel } from "./creator-channel.js";
import { readFile } from "node:fs/promises";
import { and, db, eq } from "@yt-equity/db";
import { channels, firms, claims, evidence } from "@yt-equity/db/schema";

const file = new URL("../../../apps/extension/data/channels.json", import.meta.url);
const seed = JSON.parse(await readFile(file, "utf8")) as { channels: Array<Record<string, string>> };
const items = seed.channels;
console.log(`Seeding ${items.length} channels...`);

try {
  await seedCreatorChannel(db);
  await db.insert(channels).values(items.map((item) => ({ channelId: item.channelId, handle: item.channelHandle, name: item.channelName, profilePictureUrl: item.profilePictureURL }))).onConflictDoNothing();
  await db.insert(firms).values(Array.from(new Map(items.filter((item) => item.firmName).map((item) => [item.firmName, { name: item.firmName, website: item.firmWebsite }])).values())).onConflictDoNothing();

  const [channelRows, firmRows, claimRows, evidenceRows] = await Promise.all([
    db.select().from(channels), db.select().from(firms), db.select().from(claims), db.select().from(evidence)
  ]);
  const channelById = new Map(channelRows.map((row) => [row.channelId, row]));
  const firmByName = new Map(firmRows.map((row) => [row.name, row]));
  const claimByKey = new Map(claimRows.map((row) => [`${row.channelId}:${row.type}`, row]));
  const evidenceKeys = new Set(evidenceRows.map((row) => `${row.claimId}:${row.url}`));
  const missingClaims: Array<typeof claims.$inferInsert> = [];
  const updates: Array<Promise<unknown>> = [];

  for (const item of items) {
    const channel = channelById.get(item.channelId);
    if (!channel) continue;
    const firm = item.firmName ? firmByName.get(item.firmName) : undefined;
    const type = (item.type === "acquistion" ? "acquisition" : item.type) as "funding" | "acquisition";
    const key = `${channel.id}:${type}`;
    const existingClaim = claimByKey.get(key);
    if (existingClaim) {
      updates.push(db.update(claims).set({ firmId: firm?.id, status: "confirmed", confidence: 100, published: true }).where(eq(claims.id, existingClaim.id)));
    } else {
      missingClaims.push({ channelId: channel.id, firmId: firm?.id, type, status: "confirmed", confidence: 100, published: true });
    }
  }
  if (missingClaims.length) await db.insert(claims).values(missingClaims);
  if (updates.length) await Promise.all(updates);

  const refreshedClaims = await db.select().from(claims);
  const refreshedClaimByKey = new Map(refreshedClaims.map((row) => [`${row.channelId}:${row.type}`, row]));
  const missingEvidence: Array<typeof evidence.$inferInsert> = [];
  for (const item of items) {
    if (!item.source) continue;
    const channel = channelById.get(item.channelId); const type = (item.type === "acquistion" ? "acquisition" : item.type) as "funding" | "acquisition";
    const claim = channel ? refreshedClaimByKey.get(`${channel.id}:${type}`) : undefined;
    if (claim && !evidenceKeys.has(`${claim.id}:${item.source}`)) { missingEvidence.push({ claimId: claim.id, url: item.source, tier: "official" }); evidenceKeys.add(`${claim.id}:${item.source}`); }
  }
  if (missingEvidence.length) await db.insert(evidence).values(missingEvidence);
  console.log(`Seed complete: ${channelRows.length} channels, ${firmRows.length} firms, ${refreshedClaims.length} claims, ${evidenceRows.length + missingEvidence.length} sources.`);
} catch (cause) {
  console.error("Seed failed:", cause);
  process.exitCode = 1;
}
