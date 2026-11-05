import type { PublicChannel } from "@yt-equity/contracts";
import { and, db, desc, eq } from "@yt-equity/db";
import { channelAliases, claims, firms } from "@yt-equity/db/schema";
import { resolveChannels } from "./channel-lookup.js";
import { channelEasterEgg } from "./easter-eggs.js";
import { evidenceForClaims } from "./evidence.js";
export function publicClaimFilter() {
  return and(eq(claims.published, true), eq(claims.status, "confirmed"));
}
export async function publicChannel(identifier: string): Promise<PublicChannel | null> {
  const channel = (await resolveChannels([identifier])).get(identifier);
  if (!channel) return null;
  const [aliases, rows] = await Promise.all([
    db.select().from(channelAliases).where(eq(channelAliases.channelId, channel.id)),
    db.select({ claim: claims, firm: firms }).from(claims).leftJoin(firms, eq(claims.firmId, firms.id))
      .where(and(eq(claims.channelId, channel.id), publicClaimFilter())).orderBy(desc(claims.announcedAt)),
  ]);
  const sourceMap = await evidenceForClaims(db, rows.map(row => row.claim.id));
  const claimData = rows.map(({ claim, firm }) => ({
    id: claim.id, type: claim.type, status: "confirmed" as const, confidence: claim.confidence,
    announcedAt: claim.announcedAt?.toISOString(), reviewedAt: claim.reviewedAt?.toISOString(),
    firm: firm ? { id: firm.id, name: firm.name, website: firm.website ?? undefined, profilePictureUrl: firm.profilePictureUrl ?? undefined, profilePictureBackground: firm.profilePictureBackground ?? undefined } : undefined,
    sources: (sourceMap.get(claim.id) ?? []).map(source => ({ ...source, title: source.title ?? undefined, publisher: source.publisher ?? undefined, notes: source.notes ?? undefined, publishedAt: source.publishedAt?.toISOString() })),
  }));
  return {
    easterEgg: channelEasterEgg(channel.easterEgg), channelId: channel.channelId, handle: channel.handle ?? undefined,
    aliases: aliases.map(a => a.alias), name: channel.name,
    profilePictureUrl: channel.profilePictureUrl ?? undefined, claims: claimData, reviewedAt: claimData[0]?.reviewedAt,
  };
}
