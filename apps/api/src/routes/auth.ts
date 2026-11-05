import { db, eq } from "@yt-equity/db";
import { moderatorInvitations, user } from "@yt-equity/db/schema";
import { auth } from "../auth.js";
import type { FastifyInstance } from "fastify";
import { fail } from "../errors.js";
export function registerAuthRoutes(app: FastifyInstance) {
  app.all("/api/auth/*", async (request, reply) => {
    if (request.raw.url?.includes("/sign-in/magic-link") && request.method === "POST") {
      const email = String((request.body as {
        email?: string;
      } | undefined)?.email ?? "").trim().toLowerCase();
      const [existing, invitation] = await Promise.all([
        db.select({ role: user.role }).from(user).where(eq(user.email, email)).limit(1),
        db.select({ expiresAt: moderatorInvitations.expiresAt, acceptedAt: moderatorInvitations.acceptedAt, revokedAt: moderatorInvitations.revokedAt }).from(moderatorInvitations).where(eq(moderatorInvitations.email, email)).limit(1)
      ]);
      const invited = invitation[0] && !invitation[0].acceptedAt && !invitation[0].revokedAt && invitation[0].expiresAt > new Date();
      if (!["moderator", "admin"].includes(existing[0]?.role ?? "") && !invited)
        return fail(reply, 403, "ACCESS_DENIED", "This email does not have workspace access.");
    }
    const url = `${process.env.BETTER_AUTH_URL ?? `http://${request.headers.host ?? "localhost:4000"}`}${request.raw.url ?? ""}`;
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : JSON.stringify(request.body ?? {});
    const response = await auth.handler(new Request(url, { method: request.method, headers: request.headers as HeadersInit, body }));
    reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie")
        reply.header(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length)
      reply.header("set-cookie", cookies);
    return reply.send(await response.text());
  });
}
