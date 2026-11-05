import type { FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
function visitorKey(request: FastifyRequest, now: number) {
  const token = request.headers["x-yt-equity-client"];
  const secret = process.env.API_PROXY_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "local-development-proxy-secret");
  if (typeof token !== "string" || !secret || token.length > 180)
    return request.ip;
  const parts = token.split(".");
  if (parts.length !== 3)
    return request.ip;
  const [id, issued, signature] = parts;
  if (!/^(?:[0-9a-f-]{36}|[0-9a-f]{64})$/i.test(id) || !/^\d{10}$/.test(issued) || !/^[0-9a-f]{64}$/.test(signature))
    return request.ip;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age < -30 || age > 300)
    return request.ip;
  const expected = createHmac("sha256", secret).update(`${id}.${issued}`).digest();
  if (!timingSafeEqual(Buffer.from(signature, "hex"), expected))
    return request.ip;
  return `visitor:${id}`;
}
export function createSubmissionLimiter(now = Date.now) {
  const counts = new Map<string, {
    count: number;
    resetAt: number;
  }>();
  return (request: FastifyRequest) => {
    const time = now();
    for (const [key, bucket] of counts)
      if (bucket.resetAt <= time)
        counts.delete(key);
    const key = visitorKey(request, time);
    const bucket = counts.get(key);
    if (!bucket) {
      counts.set(key, { count: 1, resetAt: time + 60000 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > 20;
  };
}
