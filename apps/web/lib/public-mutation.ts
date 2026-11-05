import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { apiRequest } from "./server-api";

export async function publicClientIdentity() {
  const secret = process.env.API_PROXY_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "local-development-proxy-secret");
  if (!secret) throw new Error("API_PROXY_SECRET is required for public submissions");
  let id: string;
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    // Railway's public edge supplies X-Real-IP; never trust a caller's forwarding chain.
    const address = (await headers()).get("x-real-ip")?.trim();
    if (!address || !isIP(address)) throw new Error("Trusted client address is unavailable");
    id = createHmac("sha256", secret).update(`client-ip:${address}`).digest("hex");
  } else {
    const jar = await cookies();
    const stored = jar.get("yt-equity-visitor")?.value;
    id = stored && /^[0-9a-f-]{36}$/i.test(stored) ? stored : randomUUID();
    if (id !== stored) jar.set("yt-equity-visitor", id, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400,
    });
  }
  const message = `${id}.${Math.floor(Date.now() / 1000)}`;
  const signature = createHmac("sha256", secret).update(message).digest("hex");
  return `${message}.${signature}`;
}

export async function publicMutation(path: "/api/v1/reports" | "/api/v1/submissions", payload: unknown) {
  return apiRequest(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-yt-equity-client": await publicClientIdentity() },
    body: JSON.stringify(payload),
  });
}
