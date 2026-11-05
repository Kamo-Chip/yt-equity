import type { PublicChannel, PublicFirm } from "@yt-equity/contracts";
import { ApiError } from "./http";
import { serverFetch } from "./server-api";

export async function getChannel(identifier: string) {
  const normalized = decodeURIComponent(identifier);
  try { return await serverFetch<PublicChannel>(`/api/v1/channels/${encodeURIComponent(normalized)}`, { cache: "no-store" }); }
  catch (cause) { if (cause instanceof ApiError && cause.status === 404) return null; throw cause; }
}

export async function getFirm(id: string) {
  try { return await serverFetch<PublicFirm>(`/api/v1/firms/${encodeURIComponent(decodeURIComponent(id))}`, { cache: "no-store" }); }
  catch (cause) { if (cause instanceof ApiError && cause.status === 404) return null; throw cause; }
}
