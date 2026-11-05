import type { FastifyInstance } from "fastify";
import { adminRoute } from "./authorization.js";
import { and, asc, desc, eq, ilike, count, sql } from "drizzle-orm";
import { db } from "@yt-equity/db";
import {
  user,
  moderatorInvitations as invitations,
} from "@yt-equity/db/schema";
import {
  adminUsersQuerySchema,
  adminInvitationsQuerySchema,
} from "@yt-equity/contracts";
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
export function registerAdminDirectory(app: FastifyInstance) {
  app.get(
    "/api/v1/admin/moderators/users",
    adminRoute(async (_active, request, reply) => {
      const parsed = adminUsersQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            error: {
              code: "INVALID_QUERY",
              message: "Check moderator filters.",
            },
          });
      const { q, page, pageSize, sort, direction } = parsed.data;
      const where = and(
        eq(user.role, "moderator"),
        q ? ilike(user.email, pattern(q)) : undefined,
      );
      const order = direction === "asc" ? asc : desc;
      const [items, [total]] = await Promise.all([
        db
          .select({
            id: user.id,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(where)
          .orderBy(
            order(sort === "email" ? user.email : user.createdAt),
            asc(user.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: count() }).from(user).where(where),
      ]);
      return { items, total: total.total, page, pageSize };
    }),
  );
  app.get(
    "/api/v1/admin/moderators/invitations",
    adminRoute(async (_active, request, reply) => {
      const parsed = adminInvitationsQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            error: {
              code: "INVALID_QUERY",
              message: "Check invitation filters.",
            },
          });
      const { q, page, pageSize, sort, direction, status } = parsed.data;
      const state = sql<string>`case when ${invitations.acceptedAt} is not null then 'accepted' when ${invitations.revokedAt} is not null then 'revoked' when ${invitations.expiresAt} <= ${new Date().toISOString()}::timestamptz then 'expired' else 'pending' end`;
      const where = and(
        q ? ilike(invitations.email, pattern(q)) : undefined,
        status === "all" ? undefined : eq(state, status),
      );
      const order = direction === "asc" ? asc : desc;
      const column =
        sort === "email"
          ? invitations.email
          : sort === "status"
            ? state
            : sort === "expiresAt"
              ? invitations.expiresAt
              : invitations.lastSentAt;
      const [items, [total]] = await Promise.all([
        db
          .select({
            id: invitations.id,
            email: invitations.email,
            status: state,
            expiresAt: invitations.expiresAt,
            acceptedAt: invitations.acceptedAt,
            revokedAt: invitations.revokedAt,
            lastSentAt: invitations.lastSentAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .where(where)
          .orderBy(sql`${order(column)} nulls last`, asc(invitations.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: count() }).from(invitations).where(where),
      ]);
      return { items, total: total.total, page, pageSize };
    }),
  );
}
