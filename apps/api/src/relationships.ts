import type { db as database } from "@yt-equity/db";
import { eq, desc } from "drizzle-orm";
import {
  auditEvents,
  channels,
  claims,
  evidence,
  firms,
} from "@yt-equity/db/schema";
import { evidenceForClaims } from "./evidence.js";
import type { RelationshipEditor } from "@yt-equity/contracts";

export class RelationshipError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function readRelationships(db: typeof database, id?: string) {
  const rows = await db
    .select({ claim: claims, channel: channels, firm: firms })
    .from(claims)
    .innerJoin(channels, eq(claims.channelId, channels.id))
    .leftJoin(firms, eq(claims.firmId, firms.id))
    .where(id ? eq(claims.id, id) : undefined)
    .orderBy(desc(claims.createdAt));
  const grouped = await evidenceForClaims(
    db,
    rows.map((row) => row.claim.id),
  );
  return rows.map(({ claim, channel, firm }) => ({
    ...claim,
    announcedAt: claim.announcedAt?.toISOString() ?? null,
    channel,
    firm,
    sources: (grouped.get(claim.id) ?? []).map((source) => ({
      ...source,
      title: source.title ?? undefined,
      publisher: source.publisher ?? undefined,
      notes: source.notes ?? undefined,
      publishedAt: source.publishedAt?.toISOString(),
    })),
  }));
}
export async function saveRelationship(
  db: typeof database,
  actorId: string,
  data: RelationshipEditor,
  id?: string,
) {
  try {
    const resultId = await db.transaction(async (tx) => {
      if (
        id &&
        !(
          await tx
            .select({ id: claims.id })
            .from(claims)
            .where(eq(claims.id, id))
        )[0]
      )
        throw new RelationshipError(
          404,
          "NOT_FOUND",
          "Relationship not found.",
        );
      const channel =
        "id" in data.channel
          ? (
              await tx
                .select()
                .from(channels)
                .where(eq(channels.id, data.channel.id))
            )[0]
          : (await tx.insert(channels).values(data.channel).returning())[0];
      if (!channel)
        throw new RelationshipError(
          400,
          "INVALID_REFERENCE",
          "Choose an existing channel.",
        );
      const firm =
        data.firm === null
          ? null
          : "id" in data.firm
            ? (
                await tx.select().from(firms).where(eq(firms.id, data.firm.id))
              )[0]
            : (await tx.insert(firms).values(data.firm).returning())[0];
      if (!channel || (data.firm && !firm))
        throw new RelationshipError(
          400,
          "INVALID_REFERENCE",
          "Choose an existing channel and firm.",
        );
      const values = {
        channelId: channel.id,
        firmId: firm?.id ?? null,
        type: data.type,
        status: data.status,
        confidence: data.confidence,
        announcedAt: data.announcedAt ? new Date(data.announcedAt) : null,
        published: data.published,
        reviewedAt: new Date(),
      };
      const [claim] = id
        ? await tx
            .update(claims)
            .set(values)
            .where(eq(claims.id, id))
            .returning()
        : await tx.insert(claims).values(values).returning();
      await tx.delete(evidence).where(eq(evidence.claimId, claim.id));
      if (data.sources.length)
        await tx.insert(evidence).values(
          data.sources.map((source) => ({
            ...source,
            claimId: claim.id,
            publishedAt: source.publishedAt
              ? new Date(source.publishedAt)
              : null,
          })),
        );
      await tx.insert(auditEvents).values({
        actorId,
        action: id ? "updated" : "created",
        entityType: "relationship",
        entityId: claim.id,
        metadata: {
          published: data.published,
          sourceCount: data.sources.length,
        },
      });
      return claim.id;
    });
    return (await readRelationships(db, resultId))[0];
  } catch (error) {
    const code =
      (error as { code?: string; cause?: { code?: string } }).code ??
      (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505")
      throw new RelationshipError(
        409,
        "ALREADY_EXISTS",
        "This channel or firm already exists. Select it from the list.",
      );
    throw error;
  }
}
