import { reportSchema, submissionSchema } from "@yt-equity/contracts";
import { and, db, eq } from "@yt-equity/db";
import { submissions } from "@yt-equity/db/schema";
import { resolveChannels } from "../channel-lookup.js";
import type { FastifyInstance } from "fastify";
import { fail } from "../errors.js";
import { createSubmissionLimiter } from "../submission-limiter.js";
export function registerSubmissionRoutes(app: FastifyInstance) {
  const limited = createSubmissionLimiter();
  app.post("/api/v1/submissions", async (request, reply) => {
    if (limited(request))
      return fail(reply, 429, "RATE_LIMITED", "Too many submissions. Try again later.");
    const parsed = submissionSchema.safeParse(request.body);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_SUBMISSION", "Invalid submission", parsed.error.flatten());
    const channel = (await resolveChannels([parsed.data.channelId])).get(parsed.data.channelId);
    if (!channel && (parsed.data.kind === "correction" || parsed.data.kind === "dispute"))
      return fail(reply, 400, "UNKNOWN_CHANNEL", "Corrections and disputes require an existing channel. Submit a new-channel report instead.");
    const { kind: submittedKind, channelId: submittedChannelId, contactEmail, ...payload } = parsed.data;
    const channelId = channel?.channelId ?? submittedChannelId;
    const kind = channel && submittedKind === "new_channel" ? "correction" : submittedKind;
    const duplicate = await db.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.channelId, channelId), eq(submissions.status, "pending"))).limit(1);
    if (duplicate.length)
      return fail(reply, 409, "DUPLICATE_SUBMISSION", "A similar submission is already under review.");
    const [created] = await db.insert(submissions).values({ kind, channelId, payload, contactEmail }).returning({ id: submissions.id });
    return reply.code(201).send({ id: created.id, status: "pending" });
  });
  app.post("/api/v1/reports", async (request, reply) => {
    if (limited(request))
      return fail(reply, 429, "RATE_LIMITED", "Too many reports. Try again later.");
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success)
      return fail(reply, 400, "INVALID_REPORT", "Check your report details.", parsed.error.flatten());
    const { contactEmail, ...payload } = parsed.data;
    try {
      const [created] = await db.insert(submissions).values({
        kind: "feedback", channelId: null, payload, contactEmail
      }).returning({ id: submissions.id });
      return reply.code(201).send({ id: created.id, status: "pending" });
    }
    catch {
      return fail(reply, 503, "REPORT_UNAVAILABLE", "Couldn’t send your report. Try again.");
    }
  });
}
