import { and, db, eq } from "@yt-equity/db";
import { moderatorInvitations, session, user } from "@yt-equity/db/schema";
import { isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { registerAdminDirectory } from "../admin-directory.js";
import { auth } from "../auth.js";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { adminRoute, currentSession } from "../authorization.js";
import { fail } from "../errors.js";
function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function registerAdminRoutes(app: FastifyInstance) {
  registerAdminDirectory(app);
  app.post("/api/v1/admin/moderators/invitations", adminRoute(async (active, request, reply) => {
    const email = String((request.body as {
      email?: string;
    }).email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
      return fail(reply, 400, "INVALID_EMAIL", "Enter a valid email.");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const callbackURL = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/moderator/accept-invitation?token=${token}`;
    try {
      await auth.api.signInMagicLink({ headers: request.headers as HeadersInit, body: { email, callbackURL, metadata: { invitation: true } } });
    }
    catch {
      return fail(reply, 502, "INVITATION_EMAIL_FAILED", "The invitation email could not be sent. No invitation was saved.");
    }
    const invitation = await db.transaction(async (tx) => {
      const [invitation] = await tx.insert(moderatorInvitations).values({ email, tokenHash: hash(token), invitedBy: active.user.id, expiresAt, lastSentAt: new Date() }).onConflictDoUpdate({ target: moderatorInvitations.email, set: { tokenHash: hash(token), invitedBy: active.user.id, expiresAt, acceptedAt: null, revokedAt: null, lastSentAt: new Date() } }).returning();
      await audit(tx, active.user.id, "invited", "moderator", invitation.id, { email });
      return invitation;
    });
    return reply.code(201).send({ id: invitation.id, email, expiresAt });
  }));
  app.post("/api/v1/admin/moderators/:id/revoke", adminRoute(async (active, request, reply) => {
    const id = (request.params as {
      id: string;
    }).id;
    const [target] = await db.select().from(user).where(eq(user.id, id));
    if (!target || target.role !== "moderator")
      return fail(reply, 404, "NOT_FOUND", "Moderator not found.");
    await db.transaction(async (tx) => {
      await tx.update(user).set({ role: null }).where(eq(user.id, id));
      await tx.delete(session).where(eq(session.userId, id));
      await audit(tx, active.user.id, "revoked", "moderator", id, { email: target.email });
    });
    return { ok: true };
  }));
  app.post("/api/v1/invitations/accept", async (request, reply) => {
    const active = await currentSession(request);
    if (!active)
      return fail(reply, 401, "UNAUTHORIZED", "Sign in before accepting an invitation.");
    const token = String((request.body as {
      token?: string;
    }).token ?? "");
    const [invitation] = await db.select().from(moderatorInvitations).where(eq(moderatorInvitations.tokenHash, hash(token)));
    if (!invitation || invitation.email.toLowerCase() !== active.user.email.toLowerCase() || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date())
      return fail(reply, 400, "INVALID_INVITATION", "This invitation is invalid or expired.");
    await db.transaction(async (tx) => {
      if (active.user.role !== "admin" && active.user.role !== "moderator")
        await tx.update(user).set({ role: "moderator" }).where(and(eq(user.id, active.user.id), isNull(user.role)));
      await tx.update(moderatorInvitations).set({ acceptedAt: new Date() }).where(eq(moderatorInvitations.id, invitation.id));
      await audit(tx, active.user.id, "accepted", "moderator_invitation", invitation.id);
    });
    return { ok: true };
  });
  app.get("/api/v1/workspace/session", async (request, reply) => {
    const active = await currentSession(request);
    return active?.user.role && ["moderator", "admin"].includes(active.user.role) ? { role: active.user.role } : fail(reply, 401, "UNAUTHORIZED", "Workspace authorization required.");
  });
}
