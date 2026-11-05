import { registerMediaRoutes } from "./routes/media.js";
import cors from "@fastify/cors";
import { db } from "@yt-equity/db";
import { pool } from "@yt-equity/db/client";
import Fastify from "fastify";
import { handleError } from "./errors.js";
import { readOwnershipGraph } from "./ownership-graph.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDirectoryRoutes } from "./routes/directory.js";
import { registerModerationRoutes } from "./routes/moderation.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerSubmissionRoutes } from "./routes/submissions.js";
import { snapshotCache } from "./snapshot-cache.js";
export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : {
      // Omit client addresses and query strings (magic links contain tokens).
      serializers: {
        req(request) {
          return { method: request.method, url: request.url?.split("?")[0], hostname: request.hostname };
        },
      },
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    },
  });
  const publicGraph = snapshotCache(() => readOwnershipGraph(db, {}));
  // Rebuild before acknowledging successful directory mutations, through the active routes.
  // Reports and review decisions do not change public data and keep the cache warm.
  app.addHook("onSend", async (request, reply, payload) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      reply.statusCode >= 200 && reply.statusCode < 300 &&
      /^\/api\/v1\/moderator\/(relationships|channels|firms)(\/|$)/.test(request.url.split("?")[0])) {
      publicGraph.invalidate();
      try {
        await publicGraph.warm();
      }
      catch {
        request.log.error("Public snapshot rebuild failed after a committed directory mutation");
      }
    }
    return payload;
  });
  app.setErrorHandler(handleError);
  await app.register(cors, { origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","), credentials: true });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  app.addHook("onListen", async () => {
    void publicGraph.warm().catch(() => app.log.error("Initial public snapshot warmup failed"));
  });
  app.get("/health", async () => ({ ok: true }));
  app.get("/health/ready", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!publicGraph.isReady()) {
      void publicGraph.warm().catch(() => {
      });
      return reply.code(503).send({ ok: false });
    }
    return { ok: true };
  });
  registerPublicRoutes(app, publicGraph);
  registerSubmissionRoutes(app);
  registerModerationRoutes(app);
  registerDirectoryRoutes(app);
  registerMediaRoutes(app);
  registerAdminRoutes(app);
  registerAuthRoutes(app);
  return app;
}
