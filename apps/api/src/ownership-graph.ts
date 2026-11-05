import type { OwnershipGraph,OwnershipGraphQuery } from "@yt-equity/contracts";
import type { db as database } from "@yt-equity/db";
import { channels,claims,evidence,firms } from "@yt-equity/db/schema";
import { and,asc,eq,ilike,or } from "drizzle-orm";
export async function readOwnershipGraph(
  db: typeof database,
  query: OwnershipGraphQuery,
): Promise<OwnershipGraph> {
  if (query.status && query.status !== "confirmed")
    return { nodes: [], edges: [] };
  const pattern = query.q
    ? `%${query.q.replace(/[\\%_]/g, "\\$&")}%`
    : undefined;
  const rows = await db
    .select({ claim: claims, channel: channels, firm: firms, source: evidence })
    .from(claims)
    .innerJoin(channels, eq(claims.channelId, channels.id))
    .leftJoin(firms, eq(claims.firmId, firms.id))
    .leftJoin(evidence, eq(evidence.claimId, claims.id))
    .where(
      and(
        eq(claims.published, true),
        eq(claims.status, "confirmed"),
        query.type ? eq(claims.type, query.type) : undefined,
        pattern
          ? or(
              ilike(channels.name, pattern),
              ilike(channels.handle, pattern),
              ilike(channels.channelId, pattern),
              ilike(firms.name, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(asc(claims.id), asc(evidence.tier), asc(evidence.id));
  type GraphRecord = Omit<(typeof rows)[number], "source"> & {
    sources: NonNullable<(typeof rows)[number]["source"]>[];
  };
  const grouped = new Map<string, GraphRecord>();
  for (const { source, ...row } of rows) {
    let record = grouped.get(row.claim.id);
    if (!record) {
      record = { ...row, sources: [] };
      grouped.set(row.claim.id, record);
    }
    if (source) record.sources.push(source);
  }
  const records = [...grouped.values()]
    .filter(
      (r) =>
        !query.evidenceTier ||
        r.sources.some((s) => s.tier === query.evidenceTier),
    );
  const graphRecords = records.map(record => ({
    ...record,
    firm: record.firm ? { ...record.firm, undisclosed: false } : {
      id: `undisclosed:${record.claim.id}`, name: "Undisclosed firm", website: null, profilePictureUrl: null, profilePictureBackground: null, undisclosed: true,
    },
  }));
  const uniqueFirms = new Map(graphRecords.map((r) => [r.firm.id, r.firm]));
  const uniqueChannels = new Map(graphRecords.map((r) => [r.channel.id, r.channel]));
  return {
    nodes: [
      ...[...uniqueFirms.values()].map((f) => ({
        id: `firm:${f.id}`,
        kind: "firm" as const,
        name: f.name,
        website: f.website ?? undefined,
        profilePictureUrl: f.profilePictureUrl ?? undefined,
        profilePictureBackground: f.profilePictureBackground ?? undefined,
        ...(f.undisclosed ? { undisclosed: true } : {}),
        channelCount: new Set(
          graphRecords.filter((r) => r.firm.id === f.id).map((r) => r.channel.id),
        ).size,
      })),
      ...[...uniqueChannels.values()].map((c) => ({
        id: `channel:${c.id}`,
        kind: "channel" as const,
        name: c.name,
        channelId: c.channelId,
        handle: c.handle ?? undefined,
        profilePictureUrl: c.profilePictureUrl ?? undefined,
      })),
    ],
    edges: graphRecords.map((r) => ({
      id: r.claim.id,
      source: `firm:${r.firm.id}`,
      target: `channel:${r.channel.id}`,
      type: r.claim.type,
      status: "confirmed",
      confidence: r.claim.confidence,
      announcedAt: r.claim.announcedAt?.toISOString(),
      evidenceTiers: [...new Set(r.sources.map((s) => s.tier))],
      sources: r.sources.map((s) => ({
        ...s,
        title: s.title ?? undefined,
        publisher: s.publisher ?? undefined,
        notes: s.notes ?? undefined,
        publishedAt: s.publishedAt?.toISOString(),
      })),
    })),
  };
}
