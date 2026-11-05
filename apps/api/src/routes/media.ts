import type { FastifyInstance } from "fastify";
import { imageUploadSchema, MAX_IMAGE_BASE64_LENGTH } from "@yt-equity/contracts";
import { moderatorRoute } from "../authorization.js";
import { ApiFailure } from "../errors.js";
import { uploadImage } from "../media-upload.js";
import { parseBody } from "../validation.js";

export function registerMediaRoutes(app: FastifyInstance) {
  app.post("/api/v1/moderator/media", { bodyLimit: MAX_IMAGE_BASE64_LENGTH + 1024 }, moderatorRoute(async (_active, request) => {
    const origins = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",");
    if (!request.headers.origin || !origins.includes(request.headers.origin))
      throw new ApiFailure(403, "INVALID_ORIGIN", "Upload images from the workspace.");
    return uploadImage(parseBody(imageUploadSchema, request.body, "INVALID_IMAGE"));
  }));
}
