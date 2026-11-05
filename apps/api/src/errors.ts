import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export function fail(reply: FastifyReply, status: number, code: string, message: string, details?: unknown) {
  return reply.code(status).send({ error: { code, message, details } });
}
export function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ApiFailure)
    return fail(reply, error.status, error.code, error.message, error.details);
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)
    return fail(reply, error.statusCode, error.code ?? "INVALID_REQUEST", error.statusCode === 413 ? "Request body is too large." : "Invalid request.");
  const code = error.code ?? (error.cause as {
    code?: string;
  } | undefined)?.code;
  if (code === "23505")
    return fail(reply, 409, "ALREADY_EXISTS", "This record already exists.");
  if (code === "23503")
    return fail(reply, 409, "INVALID_REFERENCE", "This record is still referenced or its related record no longer exists.");
  request.log.error({ err: error }, "Unhandled API request error");
  return fail(reply, 500, "INTERNAL_ERROR", "The API could not complete this request.");
}
