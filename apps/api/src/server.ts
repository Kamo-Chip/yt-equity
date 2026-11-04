import Fastify from "fastify";
import { z } from "zod";
import cors from "@fastify/cors";
import { and, asc, db, desc, eq, ilike, or } from "@yt-equity/db";
import { inArray, isNull } from "drizzle-orm";
import { pool } from "@yt-equity/db/client";
import { auditEvents, channelAliases, channels, claims, evidence, firms, moderationDecisions, moderatorInvitations, session, submissions, user } from "@yt-equity/db/schema";
import { channelUpdateSchema, firmUpdateSchema, relationshipEditorSchema, channelEditorSchema, channelLookupRequestSchema, claimEditorSchema, directoryQuerySchema, evidenceEditorSchema, firmEditorSchema, moderationDecisionSchema, ownershipGraphQuerySchema, reportSchema, submissionSchema } from "@yt-equity/contracts";
import { auth } from "./auth.js";
import { createHash, randomBytes } from "node:crypto";
import { readRelationships, saveRelationship, RelationshipError } from "./relationships.js";
import { evidenceForClaims } from "./evidence.js";
import { registerAdminDirectory } from "./admin-directory.js";
import { registerModeratorDirectory } from "./moderator-directory.js";
import { readOwnershipGraph } from "./ownership-graph.js";
import { snapshotCache } from "./snapshot-cache.js";
import { resolveChannels } from "./channel-lookup.js";
import { channelEasterEgg } from "./easter-eggs.js";

export const app = Fastify({
  logger: process.env.NODE_ENV === "test" ? false : {
    // Magic-link verification carries a token in the query string.
    serializers: {
      req(request) {
        return { method: request.method, url: request.url?.split("?")[0], hostname: request.hostname, remoteAddress: request.ip };
      },
    },
    redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
  },
});
const publicGraph = snapshotCache(() => readOwnershipGraph(db, {}));
// Rebuild before acknowledging successful directory mutations, including legacy routes.
// Reports and review decisions do not change public data and keep the cache warm.
app.addHook("onSend", async (request, reply, payload) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      reply.statusCode >= 200 && reply.statusCode < 300 &&
      /^\/api\/v1\/moderator\/(relationships|channels|firms|claims|evidence|aliases)(\/|$)/.test(request.url.split("?")[0]))
  {
    publicGraph.invalidate();
    try { await publicGraph.warm(); }
    catch { request.log.error("Public snapshot rebuild failed after a committed directory mutation"); }
  }
  return payload;
});
if (process.env.NODE_ENV === "production" && (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET)) throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required in production.");
app.setErrorHandler((error, request, reply) => { request.log.error({ err: error }, "Unhandled API request error"); return fail(reply, 500, "INTERNAL_ERROR", "The API could not complete this request."); });
await app.register(cors, { origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","), credentials: true });
app.addHook("onClose", async () => { await pool.end(); });
const requestCounts = new Map<string, { count: number; resetAt: number }>();
function limited(ip: string) { const now = Date.now(); const old = requestCounts.get(ip); if (!old || old.resetAt <= now) { requestCounts.set(ip, { count: 1, resetAt: now + 60_000 }); return false; } old.count += 1; return old.count > 20; }
function fail(reply: any, status: number, code: string, message: string, details?: unknown) { return reply.code(status).send({ error: { code, message, details } }); }

// Publication and confirmation are both required on every public claim query.
function publicClaimFilter() { return and(eq(claims.published, true), eq(claims.status, "confirmed")); }

async function publicChannel(identifier: string) {
  const channel = (await resolveChannels([identifier])).get(identifier);
  if (!channel) return null;
  const aliases = await db.select({ alias: channelAliases.alias }).from(channelAliases).where(eq(channelAliases.channelId, channel.id));
  const rows = await db.select({ claim: claims, firm: firms }).from(claims).leftJoin(firms, eq(claims.firmId, firms.id)).where(and(eq(claims.channelId, channel.id), publicClaimFilter())).orderBy(desc(claims.announcedAt));
  const sourceMap = await evidenceForClaims(db, rows.map(row=>row.claim.id));
  const claimData = await Promise.all(rows.map(async ({ claim, firm }) => ({
    id: claim.id, type: claim.type, status: claim.status, confidence: claim.confidence, announcedAt: claim.announcedAt?.toISOString(), reviewedAt: claim.reviewedAt?.toISOString(),
    firm: firm ? { id: firm.id, name: firm.name, website: firm.website ?? undefined } : undefined,
    sources: sourceMap.get(claim.id) ?? []
  })));
  return { easterEgg: channelEasterEgg(channel.easterEgg), channelId: channel.channelId, handle: channel.handle ?? undefined, aliases: aliases.map((a) => a.alias), name: channel.name, profilePictureUrl: channel.profilePictureUrl ?? undefined, claims: claimData, reviewedAt: claimData[0]?.reviewedAt };
}

app.addHook("onListen", async () => {
  void publicGraph.warm().catch(() => app.log.error("Initial public snapshot warmup failed"));
});
app.get("/health", async () => ({ ok: true }));
app.get("/health/ready", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
  if (!publicGraph.isReady()) {
    void publicGraph.warm().catch(() => {});
    return reply.code(503).send({ ok: false });
  }
  return { ok: true };
});
app.get("/api/v1/channels", async (request, reply) => {
  const parsed = directoryQuerySchema.safeParse(request.query); if (!parsed.success) return fail(reply, 400, "INVALID_QUERY", "Invalid directory filters", parsed.error.flatten());
  const { q, firm, evidenceTier, status, type, limit } = parsed.data; const rows = await db.select().from(channels).where(q ? or(ilike(channels.name, `%${q}%`), ilike(channels.handle, `%${q}%`)) : undefined).orderBy(asc(channels.name)).limit(limit);
  const results = (await Promise.all(rows.map((channel) => publicChannel(channel.channelId)))).filter(Boolean);
  return results.filter((channel) => channel && (!status || channel.claims.some((claim) => claim.status === status)) && (!type || channel.claims.some((claim) => claim.type === type)) && (!firm || channel.claims.some((claim) => claim.firm?.name.toLowerCase().includes(firm.toLowerCase()))) && (!evidenceTier || channel.claims.some((claim) => claim.sources.some((source) => source.tier === evidenceTier))));
});
app.post("/api/v1/channels/lookup", async (request, reply) => {
  const parsed = channelLookupRequestSchema.safeParse(request.body);
  if (!parsed.success) return fail(reply, 400, "INVALID_LOOKUP", "Invalid channel lookup request", parsed.error.flatten());
  const identifiers = parsed.data.identifiers;
  const channelByIdentifier = await resolveChannels(identifiers);
  const matchedChannels = [...new Map([...channelByIdentifier.values()].filter((channel) => channel !== undefined).map((channel) => [channel.id, channel])).values()];
  const claimRows = matchedChannels.length ? await db.select({ claim: claims, firm: firms }).from(claims).leftJoin(firms, eq(claims.firmId, firms.id)).where(and(
    inArray(claims.channelId, matchedChannels.map((channel) => channel.id)),
    publicClaimFilter()
  )).orderBy(desc(claims.announcedAt)) : [];
  const claimsByChannel = new Map<string, typeof claimRows>();
  for (const row of claimRows) {
    const rows = claimsByChannel.get(row.claim.channelId) ?? [];
    rows.push(row);
    claimsByChannel.set(row.claim.channelId, rows);
  }
  const results = identifiers.map((identifier) => {
    const channel = channelByIdentifier.get(identifier);
    if (!channel) return { identifier, channel: null };
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
app.get("/api/v1/channels/:identifier", async (request, reply) => { const { identifier } = request.params as { identifier: string }; const channel = await publicChannel(identifier); return channel ?? fail(reply, 404, "NOT_FOUND", "Channel not found"); });
app.get("/api/v1/ownership-graph", async (request, reply) => {
  const parsed = ownershipGraphQuerySchema.safeParse(request.query);
  if (!parsed.success) return fail(reply, 400, "INVALID_QUERY", "Invalid graph filters", parsed.error.flatten());
  const started = performance.now();
  // The app filters its complete snapshot locally. Legacy filtered API reads
  // remain uncached, avoiding an unbounded cache keyed by arbitrary searches.
  const result = Object.values(parsed.data).some(value => value !== undefined)
    ? { data: await readOwnershipGraph(db, parsed.data), status: "BYPASS", ageSeconds: 0 }
    : await publicGraph.get().catch(() => undefined);
  if (!result) return fail(reply, 503, "GRAPH_UNAVAILABLE", "The public graph is warming up. Please try again shortly.");
  reply.header("Cache-Control", "no-store");
  reply.header("X-Graph-Cache", result.status);
  reply.header("X-Graph-Snapshot-Age", result.ageSeconds);
  reply.header("Server-Timing", `graph;dur=${(performance.now() - started).toFixed(1)}`);
  return result.data;
});
app.get("/api/v1/firms", async () => db.select().from(firms).orderBy(asc(firms.name)));
app.get("/api/v1/firms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const [firm] = await db.select().from(firms).where(eq(firms.id, id));
  if (!firm) return fail(reply, 404, "NOT_FOUND", "Firm not found");
  const rows = await db.select({ claim: claims, channel: channels }).from(claims).innerJoin(channels, eq(claims.channelId, channels.id)).where(and(eq(claims.firmId, id), publicClaimFilter())).orderBy(desc(claims.announcedAt));
  const sourceMap = await evidenceForClaims(db, rows.map(row=>row.claim.id));
  const firmClaims = await Promise.all(rows.map(async ({ claim, channel }) => ({ id: claim.id, type: claim.type, status: claim.status, confidence: claim.confidence, announcedAt: claim.announcedAt?.toISOString(), channel: { channelId: channel.channelId, name: channel.name, handle: channel.handle ?? undefined }, sources: sourceMap.get(claim.id) ?? [] })));
  return { id: firm.id, name: firm.name, website: firm.website ?? undefined, claims: firmClaims };
});
app.post("/api/v1/submissions", async (request, reply) => {
  if (limited(request.ip)) return fail(reply, 429, "RATE_LIMITED", "Too many submissions. Try again later.");
  const parsed = submissionSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_SUBMISSION", "Invalid submission", parsed.error.flatten());
  const channel = (await resolveChannels([parsed.data.channelId])).get(parsed.data.channelId);
  if (!channel && (parsed.data.kind === "correction" || parsed.data.kind === "dispute"))
    return fail(reply, 400, "UNKNOWN_CHANNEL", "Corrections and disputes require an existing channel. Submit a new-channel report instead.");
  const payload = { ...parsed.data, channelId: channel?.channelId ?? parsed.data.channelId, kind: channel && parsed.data.kind === "new_channel" ? "correction" as const : parsed.data.kind };
  const duplicate = await db.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.channelId, payload.channelId), eq(submissions.status, "pending"))).limit(1);
  if (duplicate.length) return fail(reply, 409, "DUPLICATE_SUBMISSION", "A similar submission is already under review.");
  const [created] = await db.insert(submissions).values({ kind: payload.kind, channelId: payload.channelId, payload, contactEmail: payload.contactEmail }).returning({ id: submissions.id });
  return reply.code(201).send({ id: created.id, status: "pending" });
});
app.post("/api/v1/reports", async (request, reply) => {
  if (limited(request.ip)) return fail(reply, 429, "RATE_LIMITED", "Too many reports. Try again later.");
  const parsed = reportSchema.safeParse(request.body);
  if (!parsed.success) return fail(reply, 400, "INVALID_REPORT", "Check your report details.", parsed.error.flatten());
  try {
    const [created] = await db.insert(submissions).values({
      kind: "feedback", channelId: null, payload: parsed.data, contactEmail: parsed.data.contactEmail
    }).returning({ id: submissions.id });
    return reply.code(201).send({ id: created.id, status: "pending" });
  } catch {
    return fail(reply, 503, "REPORT_UNAVAILABLE", "Couldn’t send your report. Try again.");
  }
});
type AuthSession = typeof auth.$Infer.Session;
async function currentSession(request: { headers: Record<string, string | string[] | undefined> }) { return await auth.api.getSession({ headers: request.headers as HeadersInit }); }
async function moderator(request: { headers: Record<string, string | string[] | undefined> }) { const value = await currentSession(request); return value?.user.role && ["moderator", "admin"].includes(value.user.role) ? value : null; }
async function admin(request: { headers: Record<string, string | string[] | undefined> }) { const value = await currentSession(request); return value?.user.role === "admin" ? value : null; }
async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata?: unknown) { await db.insert(auditEvents).values({ actorId, action, entityType, entityId, metadata }); }
function hash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function dateValue(value?: string) { return value ? new Date(value) : null; }

app.get("/api/v1/moderator/submissions", async (request, reply) => {
  if (!(await moderator(request))) return fail(reply, 401, "UNAUTHORIZED", "Moderator authorization required.");
  const kind = (request.query as { queue?: string }).queue;
  try {
    const rows = await db.select().from(submissions).where(eq(submissions.status, "pending")).orderBy(asc(submissions.createdAt));
    return rows.filter((row) => kind === "disputes" ? row.kind === "dispute" : kind === "reports" ? row.kind !== "dispute" : true);
  } catch (error) {
    request.log.error({ err: error, queue: kind }, "Failed to load moderator submissions");
    return fail(reply, 503, "SUBMISSIONS_UNAVAILABLE", "Moderator submissions are temporarily unavailable.");
  }
});
app.get("/api/v1/moderator/submissions/:id", async (request, reply) => {
  if (!(await moderator(request))) return fail(reply, 401, "UNAUTHORIZED", "Moderator authorization required.");
  const { id } = request.params as { id: string }; const [target] = await db.select().from(submissions).where(eq(submissions.id, id));
  return target ?? fail(reply, 404, "NOT_FOUND", "Submission not found.");
});
app.post("/api/v1/moderator/submissions/:id/decision", async (request, reply) => {
  const active = await moderator(request); if (!active) return fail(reply, 401, "UNAUTHORIZED", "Moderator authorization required.");
  const parsed = moderationDecisionSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_DECISION", "Invalid moderation decision", parsed.error.flatten());
  const { id } = request.params as { id: string }; const [target] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!target) return fail(reply, 404, "NOT_FOUND", "Submission not found."); if (target.status !== "pending") return fail(reply, 409, "DECISION_EXISTS", "This submission has already been decided.");
  const decided = await db.transaction(async (tx) => { const [updated] = await tx.update(submissions).set({ status: parsed.data.status }).where(and(eq(submissions.id, id), eq(submissions.status, "pending"))).returning({id:submissions.id}); if(!updated)return false; await tx.insert(moderationDecisions).values({ submissionId: id, moderatorId: active.user.id, decision: parsed.data.status, note: parsed.data.note }); await tx.insert(auditEvents).values({ actorId: active.user.id, action: parsed.data.status, entityType: "submission", entityId: id, metadata: { note: parsed.data.note } }); return true; });
  if(!decided)return fail(reply,409,"DECISION_EXISTS","This submission has already been reviewed. Refresh the inbox.");
  return { ok: true };
});

function moderatorRoute<T>(handler: (active: AuthSession, request: any, reply: any) => Promise<T>) { return async (request: any, reply: any) => { const active = await currentSession(request); if (!active) return fail(reply, 401, "UNAUTHORIZED", "Sign in to the moderator workspace."); if (!active.user.role || !["moderator", "admin"].includes(active.user.role)) return fail(reply, 403, "FORBIDDEN", "Moderator access is required."); return handler(active, request, reply); }; }
registerModeratorDirectory(app, moderatorRoute);
app.get("/api/v1/moderator/relationships", moderatorRoute(async () => readRelationships(db)));
app.get("/api/v1/moderator/relationships/:id", moderatorRoute(async (_active, request, reply) => {
  const id = (request.params as { id: string }).id;
  if (!z.string().uuid().safeParse(id).success) return fail(reply, 400, "INVALID_ID", "Invalid relationship ID.");
  return (await readRelationships(db, id))[0] ?? fail(reply, 404, "NOT_FOUND", "Relationship not found.");
}));
for (const method of ["POST", "PATCH"] as const) app.route({ method, url: "/api/v1/moderator/relationships" + (method === "PATCH" ? "/:id" : ""), handler: moderatorRoute(async (active, request, reply) => {
  const parsed = relationshipEditorSchema.safeParse(request.body);
  if (!parsed.success) return fail(reply, 400, "INVALID_RELATIONSHIP", "Check the relationship fields.", parsed.error.flatten());
  const id = method === "PATCH" ? (request.params as { id: string }).id : undefined;
  if (id && !z.string().uuid().safeParse(id).success) return fail(reply, 400, "INVALID_ID", "Invalid relationship ID.");
  try { const result = await saveRelationship(db, active.user.id, parsed.data, id); return reply.code(method === "POST" ? 201 : 200).send(result); }
  catch (error) { if (error instanceof RelationshipError) return fail(reply, error.status, error.code, error.message); throw error; }
}) });

app.get("/api/v1/moderator/channels", moderatorRoute(async (_active, request) => { const q = String((request.query as { q?: string }).q ?? ""); return db.select().from(channels).where(q ? or(ilike(channels.name, `%${q}%`), ilike(channels.channelId, `%${q}%`), ilike(channels.handle, `%${q}%`)) : undefined).orderBy(asc(channels.name)); }));
app.post("/api/v1/moderator/channels", moderatorRoute(async (active, request, reply) => { const parsed = channelEditorSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_CHANNEL", "Invalid channel", parsed.error.flatten()); const [created] = await db.insert(channels).values(parsed.data).returning(); await audit(active.user.id, "created", "channel", created.id, parsed.data); return reply.code(201).send(created); }));
app.patch("/api/v1/moderator/channels/:id", moderatorRoute(async (active, request, reply) => { const parsed = channelUpdateSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_CHANNEL", "Invalid channel", parsed.error.flatten()); const { id } = request.params as { id: string }; const [updated] = await db.update(channels).set({ ...parsed.data, updatedAt: new Date() }).where(eq(channels.id, id)).returning(); if (!updated) return fail(reply, 404, "NOT_FOUND", "Channel not found."); await audit(active.user.id, "updated", "channel", id, parsed.data); return updated; }));
app.delete("/api/v1/moderator/channels/:id", moderatorRoute(async (active, request, reply) => { const id = (request.params as { id: string }).id; if ((await db.select({ id: claims.id }).from(claims).where(eq(claims.channelId, id)).limit(1)).length) return fail(reply, 409, "HAS_CLAIMS", "Archive or reassign this channel’s claims first."); const [removed] = await db.delete(channels).where(eq(channels.id, id)).returning(); if (!removed) return fail(reply, 404, "NOT_FOUND", "Channel not found."); await audit(active.user.id, "deleted", "channel", id); return { ok: true }; }));
app.get("/api/v1/moderator/channels/:id/aliases", moderatorRoute(async (_active, request) => db.select().from(channelAliases).where(eq(channelAliases.channelId, (request.params as { id: string }).id))));
app.post("/api/v1/moderator/channels/:id/aliases", moderatorRoute(async (active, request, reply) => { const alias = String((request.body as { alias?: string }).alias ?? "").trim(); if (!alias) return fail(reply, 400, "INVALID_ALIAS", "Alias is required."); const channelId = (request.params as { id: string }).id; const [created] = await db.insert(channelAliases).values({ channelId, alias }).returning(); await audit(active.user.id, "created", "channel_alias", created.id, { alias, channelId }); return reply.code(201).send(created); }));
app.delete("/api/v1/moderator/aliases/:id", moderatorRoute(async (active, request, reply) => { const id = (request.params as { id: string }).id; const [removed] = await db.delete(channelAliases).where(eq(channelAliases.id, id)).returning(); if (!removed) return fail(reply, 404, "NOT_FOUND", "Alias not found."); await audit(active.user.id, "deleted", "channel_alias", id); return { ok: true }; }));

app.get("/api/v1/moderator/firms", moderatorRoute(async (_active, request) => { const q = String((request.query as { q?: string }).q ?? ""); return db.select().from(firms).where(q ? ilike(firms.name, `%${q}%`) : undefined).orderBy(asc(firms.name)); }));
app.post("/api/v1/moderator/firms", moderatorRoute(async (active, request, reply) => { const parsed = firmEditorSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_FIRM", "Invalid firm", parsed.error.flatten()); const [created] = await db.insert(firms).values(parsed.data).returning(); await audit(active.user.id, "created", "firm", created.id, parsed.data); return reply.code(201).send(created); }));
app.patch("/api/v1/moderator/firms/:id", moderatorRoute(async (active, request, reply) => { const parsed = firmUpdateSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_FIRM", "Invalid firm", parsed.error.flatten()); const id = (request.params as { id: string }).id; const [updated] = await db.update(firms).set(parsed.data).where(eq(firms.id, id)).returning(); if (!updated) return fail(reply, 404, "NOT_FOUND", "Firm not found."); await audit(active.user.id, "updated", "firm", id, parsed.data); return updated; }));
app.delete("/api/v1/moderator/firms/:id", moderatorRoute(async (active, request, reply) => { const id = (request.params as { id: string }).id; if ((await db.select({ id: claims.id }).from(claims).where(eq(claims.firmId, id)).limit(1)).length) return fail(reply, 409, "HAS_CLAIMS", "Reassign this firm’s claims first."); const [removed] = await db.delete(firms).where(eq(firms.id, id)).returning(); if (!removed) return fail(reply, 404, "NOT_FOUND", "Firm not found."); await audit(active.user.id, "deleted", "firm", id); return { ok: true }; }));

app.get("/api/v1/moderator/claims", moderatorRoute(async () => db.select({ claim: claims, channel: channels, firm: firms }).from(claims).innerJoin(channels, eq(claims.channelId, channels.id)).leftJoin(firms, eq(claims.firmId, firms.id)).orderBy(desc(claims.createdAt))));
app.post("/api/v1/moderator/claims", moderatorRoute(async (active, request, reply) => { const parsed = claimEditorSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_CLAIM", "Invalid claim", parsed.error.flatten()); const [created] = await db.insert(claims).values({ ...parsed.data, announcedAt: dateValue(parsed.data.announcedAt), reviewedAt: new Date() }).returning(); await audit(active.user.id, "created", "claim", created.id, parsed.data); return reply.code(201).send(created); }));
app.patch("/api/v1/moderator/claims/:id", moderatorRoute(async (active, request, reply) => { const parsed = claimEditorSchema.partial().safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_CLAIM", "Invalid claim", parsed.error.flatten()); const id = (request.params as { id: string }).id; const values = { ...parsed.data, ...(parsed.data.announcedAt !== undefined ? { announcedAt: dateValue(parsed.data.announcedAt) } : {}), reviewedAt: new Date() }; const [updated] = await db.update(claims).set(values as any).where(eq(claims.id, id)).returning(); if (!updated) return fail(reply, 404, "NOT_FOUND", "Claim not found."); await audit(active.user.id, "updated", "claim", id, parsed.data); return updated; }));
app.post("/api/v1/moderator/claims/:id/archive", moderatorRoute(async (active, request, reply) => { const id = (request.params as { id: string }).id; const updated = await db.transaction(async (tx) => { const [record] = await tx.update(claims).set({ published: false, reviewedAt: new Date() }).where(eq(claims.id, id)).returning(); if (record) await tx.insert(auditEvents).values({ actorId: active.user.id, action: "archived", entityType: "claim", entityId: id }); return record; }); return updated ?? fail(reply, 404, "NOT_FOUND", "Claim not found."); }));

app.get("/api/v1/moderator/evidence", moderatorRoute(async (_active, request) => { const claimId = (request.query as { claimId?: string }).claimId; return db.select().from(evidence).where(claimId ? eq(evidence.claimId, claimId) : undefined).orderBy(desc(evidence.publishedAt)); }));
app.post("/api/v1/moderator/evidence", moderatorRoute(async (active, request, reply) => { const parsed = evidenceEditorSchema.safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_EVIDENCE", "Invalid evidence", parsed.error.flatten()); const [created] = await db.insert(evidence).values({ ...parsed.data, publishedAt: dateValue(parsed.data.publishedAt) }).returning(); await audit(active.user.id, "created", "evidence", created.id, parsed.data); return reply.code(201).send(created); }));
app.patch("/api/v1/moderator/evidence/:id", moderatorRoute(async (active, request, reply) => { const parsed = evidenceEditorSchema.omit({ claimId: true }).partial().safeParse(request.body); if (!parsed.success) return fail(reply, 400, "INVALID_EVIDENCE", "Invalid evidence", parsed.error.flatten()); const id = (request.params as { id: string }).id; const values = { ...parsed.data, ...(parsed.data.publishedAt !== undefined ? { publishedAt: dateValue(parsed.data.publishedAt) } : {}) }; const [updated] = await db.update(evidence).set(values as any).where(eq(evidence.id, id)).returning(); if (!updated) return fail(reply, 404, "NOT_FOUND", "Evidence not found."); await audit(active.user.id, "updated", "evidence", id, parsed.data); return updated; }));
app.delete("/api/v1/moderator/evidence/:id", moderatorRoute(async (active, request, reply) => { const id = (request.params as { id: string }).id; const [removed] = await db.delete(evidence).where(eq(evidence.id, id)).returning(); if (!removed) return fail(reply, 404, "NOT_FOUND", "Evidence not found."); await audit(active.user.id, "deleted", "evidence", id); return { ok: true }; }));
app.get("/api/v1/moderator/audit-events", moderatorRoute(async () => db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200)));

registerAdminDirectory(app, handler => async (request, reply) => {
  const active = await currentSession(request);
  if (!active) return fail(reply, 401, "UNAUTHORIZED", "Sign in required.");
  if (active.user.role !== "admin") return fail(reply, 403, "FORBIDDEN", "Administrator access required.");
  return handler(request, reply);
});
app.get("/api/v1/admin/moderators", async (request, reply) => { if (!(await admin(request))) return fail(reply, 401, "UNAUTHORIZED", "Administrator authorization required."); const [users, invitations] = await Promise.all([db.select({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt }).from(user).where(eq(user.role, "moderator")), db.select({ id: moderatorInvitations.id, email: moderatorInvitations.email, expiresAt: moderatorInvitations.expiresAt, acceptedAt: moderatorInvitations.acceptedAt, revokedAt: moderatorInvitations.revokedAt, lastSentAt: moderatorInvitations.lastSentAt, createdAt: moderatorInvitations.createdAt }).from(moderatorInvitations).orderBy(desc(moderatorInvitations.createdAt))]); return { users, invitations }; });
app.post("/api/v1/admin/moderators/invitations", async (request, reply) => { const active = await admin(request); if (!active) return fail(reply, 401, "UNAUTHORIZED", "Administrator authorization required."); const email = String((request.body as { email?: string }).email ?? "").trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return fail(reply, 400, "INVALID_EMAIL", "Enter a valid email."); const token = randomBytes(32).toString("hex"); const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); const callbackURL = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/moderator/accept-invitation?token=${token}`; try { await (auth.api as any).signInMagicLink({ headers: request.headers as HeadersInit, body: { email, callbackURL, metadata: { invitation: true } } }); } catch { return fail(reply, 502, "INVITATION_EMAIL_FAILED", "The invitation email could not be sent. No invitation was saved."); } const [invitation] = await db.insert(moderatorInvitations).values({ email, tokenHash: hash(token), invitedBy: active.user.id, expiresAt, lastSentAt: new Date() }).onConflictDoUpdate({ target: moderatorInvitations.email, set: { tokenHash: hash(token), invitedBy: active.user.id, expiresAt, acceptedAt: null, revokedAt: null, lastSentAt: new Date() } }).returning(); await audit(active.user.id, "invited", "moderator", invitation.id, { email }); return reply.code(201).send({ id: invitation.id, email, expiresAt }); });
app.post("/api/v1/admin/moderators/:id/revoke", async (request, reply) => { const active = await admin(request); if (!active) return fail(reply, 401, "UNAUTHORIZED", "Administrator authorization required."); const id = (request.params as { id: string }).id; const [target] = await db.select().from(user).where(eq(user.id, id)); if (!target || target.role !== "moderator") return fail(reply, 404, "NOT_FOUND", "Moderator not found."); await db.transaction(async (tx) => { await tx.update(user).set({ role: null }).where(eq(user.id, id)); await tx.delete(session).where(eq(session.userId, id)); await tx.insert(auditEvents).values({ actorId: active.user.id, action: "revoked", entityType: "moderator", entityId: id, metadata: { email: target.email } }); }); return { ok: true }; });
app.post("/api/v1/invitations/accept", async (request, reply) => { const active = await currentSession(request); if (!active) return fail(reply, 401, "UNAUTHORIZED", "Sign in before accepting an invitation."); const token = String((request.body as { token?: string }).token ?? ""); const [invitation] = await db.select().from(moderatorInvitations).where(eq(moderatorInvitations.tokenHash, hash(token))); if (!invitation || invitation.email.toLowerCase() !== active.user.email.toLowerCase() || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) return fail(reply, 400, "INVALID_INVITATION", "This invitation is invalid or expired."); await db.transaction(async (tx) => { if (active.user.role !== "admin" && active.user.role !== "moderator") await tx.update(user).set({ role: "moderator" }).where(and(eq(user.id, active.user.id), isNull(user.role))); await tx.update(moderatorInvitations).set({ acceptedAt: new Date() }).where(eq(moderatorInvitations.id, invitation.id)); await tx.insert(auditEvents).values({ actorId: active.user.id, action: "accepted", entityType: "moderator_invitation", entityId: invitation.id }); }); return { ok: true }; });
app.get("/api/v1/workspace/session", async (request, reply) => { const active = await currentSession(request); return active?.user.role && ["moderator", "admin"].includes(active.user.role) ? { role: active.user.role } : fail(reply, 401, "UNAUTHORIZED", "Workspace authorization required."); });
app.all("/api/auth/*", async (request, reply) => {
  if (request.raw.url?.includes("/sign-in/magic-link") && request.method === "POST") {
    const email = String((request.body as { email?: string } | undefined)?.email ?? "").trim().toLowerCase();
    const [existing, invitation] = await Promise.all([
      db.select({ role: user.role }).from(user).where(eq(user.email, email)).limit(1),
      db.select({ expiresAt: moderatorInvitations.expiresAt, acceptedAt: moderatorInvitations.acceptedAt, revokedAt: moderatorInvitations.revokedAt }).from(moderatorInvitations).where(eq(moderatorInvitations.email, email)).limit(1)
    ]);
    const invited = invitation[0] && !invitation[0].acceptedAt && !invitation[0].revokedAt && invitation[0].expiresAt > new Date();
    if (!["moderator", "admin"].includes(existing[0]?.role ?? "") && !invited) return fail(reply, 403, "ACCESS_DENIED", "This email does not have workspace access.");
  }
  const url = `${process.env.BETTER_AUTH_URL ?? `http://${request.headers.host ?? "localhost:4000"}`}${request.raw.url ?? ""}`;
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : JSON.stringify(request.body ?? {});
  const response = await auth.handler(new Request(url, { method: request.method, headers: request.headers as HeadersInit, body }));
  reply.status(response.status);
  response.headers.forEach((value, key) => { if (key.toLowerCase() !== "set-cookie") reply.header(key, value); });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) reply.header("set-cookie", cookies);
  return reply.send(await response.text());
});
if (process.env.NODE_ENV !== "test") await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
