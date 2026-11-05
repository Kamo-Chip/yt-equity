import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiFailure } from "./errors.js";
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown, code: string): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiFailure(400, code, "Check the record fields.", parsed.error.flatten());
  return parsed.data;
}
export function resourceId(request: FastifyRequest) {
  const id = (request.params as {
    id: string;
  }).id;
  if (!z.string().uuid().safeParse(id).success)
    throw new ApiFailure(400, "INVALID_ID", "Invalid record ID.");
  return id;
}
