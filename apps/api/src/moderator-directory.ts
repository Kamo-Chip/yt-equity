import { moderatorDirectoryQuerySchema, moderatorInboxQuerySchema, } from "@yt-equity/contracts";
import { db } from "@yt-equity/db";
import { channels, claims, firms, submissions } from "@yt-equity/db/schema";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { WorkspaceGate } from "./authorization.js";
import { fail } from "./errors.js";
import { resolveChannels } from "./channel-lookup.js";
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
const summary = (row: {
  claim: typeof claims.$inferSelect;
  channel: typeof channels.$inferSelect;
  firm: typeof firms.$inferSelect | null;
}) => ({
  ...row.claim,
  channel: row.channel,
  firm: row.firm,
  announcedAt: row.claim.announcedAt?.toISOString() ?? null,
});
export function registerModeratorDirectory(app: FastifyInstance, gate: WorkspaceGate) {
  app.get("/api/v1/moderator/inbox", gate(async (_active, request, reply) => {
    const parsed = moderatorInboxQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_QUERY", "Check inbox filters.", parsed.error.flatten());
    const { q, page, pageSize, kind } = parsed.data;
    const matching = and(eq(submissions.status, "pending"), q
      ? or(ilike(submissions.channelId, pattern(q)), ilike(submissions.contactEmail, pattern(q)), ilike(sql<string> `${submissions.payload}->>'explanation'`, pattern(q)))
      : undefined);
    const kindFilter = kind === "feedback"
      ? eq(submissions.kind, "feedback")
      : kind === "disputes"
        ? eq(submissions.kind, "dispute")
        : kind === "reports"
          ? and(sql`${submissions.kind} <> 'dispute'`, sql`${submissions.kind} <> 'feedback'`)
          : undefined;
    const [grouped, items] = await Promise.all([
      db
        .select({ kind: submissions.kind, total: count() })
        .from(submissions)
        .where(matching)
        .groupBy(submissions.kind),
      db
        .select()
        .from(submissions)
        .where(and(matching, kindFilter))
        .orderBy(asc(submissions.createdAt), asc(submissions.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const counts = { all: 0, reports: 0, disputes: 0, feedback: 0 };
    for (const row of grouped) {
      counts.all += row.total;
      counts[row.kind === "feedback"
        ? "feedback"
        : row.kind === "dispute"
          ? "disputes"
          : "reports"] += row.total;
    }
    return { items, total: counts[kind], page, pageSize, counts };
  }));
  app.get("/api/v1/moderator/submissions/:id/context", gate(async (_active, request, reply) => {
    const id = String((request.params as {
      id: string;
    }).id);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      return fail(reply, 400, "INVALID_ID", "Invalid report ID.");
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, id));
    if (!submission)
      return fail(reply, 404, "NOT_FOUND", "Report not found.");
    const channel = submission.channelId
      ? ((await resolveChannels([submission.channelId])).get(submission.channelId) ?? null)
      : null;
    const relationships = channel
      ? await db
        .select({ claim: claims, channel: channels, firm: firms })
        .from(claims)
        .innerJoin(channels, eq(claims.channelId, channels.id))
        .leftJoin(firms, eq(claims.firmId, firms.id))
        .where(eq(claims.channelId, channel.id))
        .orderBy(desc(claims.createdAt), asc(claims.id))
      : [];
    return { submission, channel, relationships: relationships.map(summary) };
  }));
  app.get("/api/v1/moderator/directory", gate(async (_active, request, reply) => {
    const parsed = moderatorDirectoryQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_QUERY", "Check directory filters.", parsed.error.flatten());
    const { resource, q, type, status, publication, page, pageSize, sort, direction, } = parsed.data;
    const order = direction === "desc" ? desc : asc;
    if (sort === "status" && resource !== "relationships")
      return fail(reply, 400, "INVALID_QUERY", "Status sorting is only available for relationships.");
    if (resource === "channels") {
      const where = q
        ? or(ilike(channels.name, pattern(q)), ilike(channels.handle, pattern(q)), ilike(channels.channelId, pattern(q)))
        : undefined;
      const [items, [total]] = await Promise.all([
        db
          .select()
          .from(channels)
          .where(where)
          .orderBy(sort
            ? order(sort === "details"
              ? sql`coalesce(${channels.handle}, ${channels.channelId})`
              : channels.name)
            : asc(channels.name), asc(channels.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: count() }).from(channels).where(where),
      ]);
      return { resource, items, total: total.total, page, pageSize };
    }
    if (resource === "firms") {
      const where = q
        ? or(ilike(firms.name, pattern(q)), ilike(firms.website, pattern(q)))
        : undefined;
      const [items, [total]] = await Promise.all([
        db
          .select()
          .from(firms)
          .where(where)
          .orderBy(sort
            ? order(sort === "details"
              ? sql`coalesce(${firms.website}, '')`
              : firms.name)
            : asc(firms.name), asc(firms.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: count() }).from(firms).where(where),
      ]);
      return { resource, items, total: total.total, page, pageSize };
    }
    const where = and(q
      ? or(ilike(channels.name, pattern(q)), ilike(channels.handle, pattern(q)), ilike(channels.channelId, pattern(q)), ilike(firms.name, pattern(q)))
      : undefined, type === "all" ? undefined : eq(claims.type, type), status === "all" ? undefined : eq(claims.status, status), publication === "all"
      ? undefined
      : eq(claims.published, publication === "published"));
    const [rows, [total]] = await Promise.all([
      db
        .select({ claim: claims, channel: channels, firm: firms })
        .from(claims)
        .innerJoin(channels, eq(claims.channelId, channels.id))
        .leftJoin(firms, eq(claims.firmId, firms.id))
        .where(where)
        .orderBy(sort
          ? order(sort === "name"
            ? channels.name
            : sort === "details"
              ? sql`concat(${claims.type}, ' ', coalesce(${firms.name}, 'an undisclosed firm'))`
              : sort === "status"
                ? sql`${claims.status}::text`
                : claims.createdAt)
          : desc(claims.createdAt), asc(claims.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(claims)
        .innerJoin(channels, eq(claims.channelId, channels.id))
        .leftJoin(firms, eq(claims.firmId, firms.id))
        .where(where),
    ]);
    return {
      resource,
      items: rows.map(summary),
      total: total.total,
      page,
      pageSize,
    };
  }));
}
