import { channelEditorSchema, channelUpdateSchema, firmEditorSchema, firmUpdateSchema } from "@yt-equity/contracts";
import { db, desc } from "@yt-equity/db";
import { auditEvents } from "@yt-equity/db/schema";
import type { FastifyInstance } from "fastify";
import { moderatorRoute } from "../authorization.js";
import * as directory from "../directory-writes.js";
import { parseBody, resourceId } from "../validation.js";
export function registerDirectoryRoutes(app: FastifyInstance) {
  app.post("/api/v1/moderator/channels", moderatorRoute(async (active, request, reply) => {
    const data = parseBody(channelEditorSchema, request.body, "INVALID_CHANNEL");
    const created = await directory.createChannel(active.user.id, data);
    return reply.code(201).send(created);
  }));
  app.patch("/api/v1/moderator/channels/:id", moderatorRoute(async (active, request) => directory.updateChannel(active.user.id, resourceId(request), parseBody(channelUpdateSchema, request.body, "INVALID_CHANNEL"))));
  app.delete("/api/v1/moderator/channels/:id", moderatorRoute(async (active, request) => {
    await directory.deleteChannel(active.user.id, resourceId(request));
    return { ok: true };
  }));
  app.post("/api/v1/moderator/firms", moderatorRoute(async (active, request, reply) => {
    const created = await directory.createFirm(active.user.id, parseBody(firmEditorSchema, request.body, "INVALID_FIRM"));
    return reply.code(201).send(created);
  }));
  app.patch("/api/v1/moderator/firms/:id", moderatorRoute(async (active, request) => directory.updateFirm(active.user.id, resourceId(request), parseBody(firmUpdateSchema, request.body, "INVALID_FIRM"))));
  app.delete("/api/v1/moderator/firms/:id", moderatorRoute(async (active, request) => {
    await directory.deleteFirm(active.user.id, resourceId(request));
    return { ok: true };
  }));
  app.get("/api/v1/moderator/audit-events", moderatorRoute(async () => db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200)));
}
