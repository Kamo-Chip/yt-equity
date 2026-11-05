import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "./auth.js";
import { fail } from "./errors.js";
export type AuthSession = typeof auth.$Infer.Session;
export type AuthorizedHandler = (active: AuthSession, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export type WorkspaceGate = (handler: AuthorizedHandler) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
export async function currentSession(request: FastifyRequest) {
  return auth.api.getSession({ headers: request.headers as HeadersInit });
}
function gate(roles: string[]): WorkspaceGate {
  return handler => async (request, reply) => {
    const active = await currentSession(request);
    if (!active)
      return fail(reply, 401, "UNAUTHORIZED", "Sign in to the workspace.");
    if (!active.user.role || !roles.includes(active.user.role))
      return fail(reply, 403, "FORBIDDEN", "Workspace permission required.");
    return handler(active, request, reply);
  };
}
export const moderatorRoute = gate(["moderator", "admin"]);
export const adminRoute = gate(["admin"]);
