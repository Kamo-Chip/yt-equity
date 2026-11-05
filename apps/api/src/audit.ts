import { db } from "@yt-equity/db";
import { auditEvents } from "@yt-equity/db/schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function audit(tx: Transaction, actorId: string, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await tx.insert(auditEvents).values({ actorId, action, entityType, entityId, metadata });
}
