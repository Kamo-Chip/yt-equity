import { moderationDecisionSchema, relationshipEditorSchema } from "@yt-equity/contracts";
import { and, db, eq } from "@yt-equity/db";
import { auditEvents, moderationDecisions, submissions } from "@yt-equity/db/schema";
import { z } from "zod";
import { registerModeratorDirectory } from "../moderator-directory.js";
import { readRelationships, RelationshipError, saveRelationship } from "../relationships.js";
import type { FastifyInstance } from "fastify";
import { moderatorRoute } from "../authorization.js";
import { archiveRelationship } from "../directory-writes.js";
import { resourceId } from "../validation.js";
import { fail } from "../errors.js";
export function registerModerationRoutes(app: FastifyInstance) {
  app.post("/api/v1/moderator/submissions/:id/decision", moderatorRoute(async (active, request, reply) => {
    const parsed = moderationDecisionSchema.safeParse(request.body);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_DECISION", "Invalid moderation decision", parsed.error.flatten());
    const { id } = request.params as {
      id: string;
    };
    const [target] = await db.select().from(submissions).where(eq(submissions.id, id));
    if (!target)
      return fail(reply, 404, "NOT_FOUND", "Submission not found.");
    if (target.status !== "pending")
      return fail(reply, 409, "DECISION_EXISTS", "This submission has already been decided.");
    const decided = await db.transaction(async (tx) => {
      const [updated] = await tx.update(submissions).set({ status: parsed.data.status }).where(and(eq(submissions.id, id), eq(submissions.status, "pending"))).returning({ id: submissions.id });
      if (!updated)
        return false;
      await tx.insert(moderationDecisions).values({ submissionId: id, moderatorId: active.user.id, decision: parsed.data.status, note: parsed.data.note });
      await tx.insert(auditEvents).values({ actorId: active.user.id, action: parsed.data.status, entityType: "submission", entityId: id, metadata: { note: parsed.data.note } });
      return true;
    });
    if (!decided)
      return fail(reply, 409, "DECISION_EXISTS", "This submission has already been reviewed. Refresh the inbox.");
    return { ok: true };
  }));
  registerModeratorDirectory(app, moderatorRoute);
  app.post("/api/v1/moderator/relationships/:id/archive", moderatorRoute(async (active, request) => archiveRelationship(active.user.id, resourceId(request))));
  app.get("/api/v1/moderator/relationships/:id", moderatorRoute(async (_active, request, reply) => {
    const id = (request.params as {
      id: string;
    }).id;
    if (!z.string().uuid().safeParse(id).success)
      return fail(reply, 400, "INVALID_ID", "Invalid relationship ID.");
    return (await readRelationships(db, id))[0] ?? fail(reply, 404, "NOT_FOUND", "Relationship not found.");
  }));
  for (const method of ["POST", "PATCH"] as const)
    app.route({
      method, url: "/api/v1/moderator/relationships" + (method === "PATCH" ? "/:id" : ""), handler: moderatorRoute(async (active, request, reply) => {
        const parsed = relationshipEditorSchema.safeParse(request.body);
        if (!parsed.success)
          return fail(reply, 400, "INVALID_RELATIONSHIP", "Check the relationship fields.", parsed.error.flatten());
        const id = method === "PATCH" ? (request.params as {
          id: string;
        }).id : undefined;
        if (id && !z.string().uuid().safeParse(id).success)
          return fail(reply, 400, "INVALID_ID", "Invalid relationship ID.");
        try {
          const result = await saveRelationship(db, active.user.id, parsed.data, id);
          return reply.code(method === "POST" ? 201 : 200).send(result);
        }
        catch (error) {
          if (error instanceof RelationshipError)
            return fail(reply, error.status, error.code, error.message);
          throw error;
        }
      })
    });
}
