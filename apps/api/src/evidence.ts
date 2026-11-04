import type { db as database } from "@yt-equity/db";
import { asc, inArray } from "drizzle-orm";
import { evidence } from "@yt-equity/db/schema";
export async function evidenceForClaims(db: typeof database, ids: string[]) {
  const rows = ids.length
    ? await db
        .select()
        .from(evidence)
        .where(inArray(evidence.claimId, ids))
        .orderBy(asc(evidence.tier), asc(evidence.id))
    : [];
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const sources = grouped.get(row.claimId) ?? [];
    sources.push(row);
    grouped.set(row.claimId, sources);
  }
  return grouped;
}
