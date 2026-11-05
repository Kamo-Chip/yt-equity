import { channelLookupRequestSchema, ownershipGraphQuerySchema } from "@yt-equity/contracts";
import { and, db, desc, eq } from "@yt-equity/db";
import { channels, claims, firms } from "@yt-equity/db/schema";
import { inArray } from "drizzle-orm";
import { resolveChannels } from "../channel-lookup.js";
import { channelEasterEgg } from "../easter-eggs.js";
import { evidenceForClaims } from "../evidence.js";
import { readOwnershipGraph } from "../ownership-graph.js";
import { snapshotCache } from "../snapshot-cache.js";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { channelIdentifierSchema } from "@yt-equity/contracts";
import type { FastifyInstance } from "fastify";
import { fail } from "../errors.js";
import { publicChannel, publicClaimFilter } from "../public-directory.js";
type PublicSnapshot = ReturnType<typeof snapshotCache<OwnershipGraph>>;
export function registerPublicRoutes(app: FastifyInstance, publicGraph: PublicSnapshot) {
  app.post("/api/v1/channels/lookup", async (request, reply) => {
    const parsed = channelLookupRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_LOOKUP", "Invalid channel lookup request", parsed.error.flatten());
    const identifiers = parsed.data.identifiers;
    const valid = new Map(identifiers.map(identifier => [identifier, channelIdentifierSchema.safeParse(identifier)]));
    const normalized = [...valid.values()].flatMap(value => value.success ? [value.data] : []);
    const resolved = await resolveChannels(normalized);
    const channelByIdentifier = new Map(identifiers.map(identifier => {
      const value = valid.get(identifier)!;
      return [identifier, value.success ? resolved.get(value.data) : undefined];
    }));
    const matchedChannels = [...new Map([...channelByIdentifier.values()].filter((channel) => channel !== undefined).map((channel) => [channel.id, channel])).values()];
    const claimRows = matchedChannels.length ? await db.select({ claim: claims, firm: firms }).from(claims).leftJoin(firms, eq(claims.firmId, firms.id)).where(and(inArray(claims.channelId, matchedChannels.map((channel) => channel.id)), publicClaimFilter())).orderBy(desc(claims.announcedAt)) : [];
    const claimsByChannel = new Map<string, typeof claimRows>();
    for (const row of claimRows) {
      const rows = claimsByChannel.get(row.claim.channelId) ?? [];
      rows.push(row);
      claimsByChannel.set(row.claim.channelId, rows);
    }
    const results = identifiers.map((identifier) => {
      if (!valid.get(identifier)!.success)
        return { identifier, channel: null, error: { code: "INVALID_IDENTIFIER" } };
      const channel = channelByIdentifier.get(identifier);
      if (!channel)
        return { identifier, channel: null };
      return {
        identifier,
        channel: {
          easterEgg: channelEasterEgg(channel.easterEgg),
          channelId: channel.channelId,
          handle: channel.handle ?? undefined,
          name: channel.name,
          claims: (claimsByChannel.get(channel.id) ?? []).map(({ claim, firm }) => ({
            id: claim.id,
            type: claim.type,
            status: claim.status as "confirmed" | "provisional" | "disputed",
            firm: firm ? { id: firm.id, name: firm.name } : undefined
          }))
        }
      };
    });
    return { results };
  });
  app.get("/api/v1/channels/:identifier", async (request, reply) => {
    const { identifier } = request.params as {
      identifier: string;
    };
    const channel = await publicChannel(identifier);
    return channel ?? fail(reply, 404, "NOT_FOUND", "Channel not found");
  });
  app.get("/api/v1/ownership-graph", async (request, reply) => {
    const parsed = ownershipGraphQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_QUERY", "Invalid graph filters", parsed.error.flatten());
    const started = performance.now();
    // The app filters its complete snapshot locally. Filtered API reads bypass
    // the canonical cache to avoid unbounded caches keyed by arbitrary searches.
    const result = Object.values(parsed.data).some(value => value !== undefined)
      ? { data: await readOwnershipGraph(db, parsed.data), status: "BYPASS", ageSeconds: 0 }
      : await publicGraph.get().catch(() => undefined);
    if (!result)
      return fail(reply, 503, "GRAPH_UNAVAILABLE", "The public graph is warming up. Please try again shortly.");
    reply.header("Cache-Control", "no-store");
    reply.header("X-Graph-Cache", result.status);
    reply.header("X-Graph-Snapshot-Age", result.ageSeconds);
    reply.header("Server-Timing", `graph;dur=${(performance.now() - started).toFixed(1)}`);
    return result.data;
  });
  app.get("/api/v1/firms/:id", async (request, reply) => {
    const { id } = request.params as {
      id: string;
    };
    const [firm] = await db.select().from(firms).where(eq(firms.id, id));
    if (!firm)
      return fail(reply, 404, "NOT_FOUND", "Firm not found");
    const rows = await db.select({ claim: claims, channel: channels }).from(claims).innerJoin(channels, eq(claims.channelId, channels.id)).where(and(eq(claims.firmId, id), publicClaimFilter())).orderBy(desc(claims.announcedAt));
    const sourceMap = await evidenceForClaims(db, rows.map(row => row.claim.id));
    const firmClaims = rows.map(({ claim, channel }) => ({ id: claim.id, type: claim.type, status: claim.status, confidence: claim.confidence, announcedAt: claim.announcedAt?.toISOString(), channel: { channelId: channel.channelId, name: channel.name, handle: channel.handle ?? undefined }, sources: sourceMap.get(claim.id) ?? [] }));
    return { id: firm.id, name: firm.name, website: firm.website ?? undefined, profilePictureUrl: firm.profilePictureUrl ?? undefined, profilePictureBackground: firm.profilePictureBackground ?? undefined, claims: firmClaims };
  });
}
