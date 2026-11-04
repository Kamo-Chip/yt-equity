import "server-only";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { apiFetch, getChannel, getFirm } from "./api";
import { PUBLIC_DIRECTORY_TAG } from "./cache-policy";

// Cache public data only: never read request headers or forward session cookies.
// Fastify owns persistent graph caching; React only deduplicates within a render.
export const getPublicGraph = cache(async () => {
  const graph = await apiFetch<OwnershipGraph>("/api/v1/ownership-graph");
  return { graph };
});

export async function getPublicChannel(identifier: string) {
  "use cache";
  cacheLife({ stale: 0, revalidate: 30, expire: 60 });
  cacheTag(PUBLIC_DIRECTORY_TAG);
  return getChannel(identifier);
}

export async function getPublicFirm(id: string) {
  "use cache";
  cacheLife({ stale: 0, revalidate: 30, expire: 60 });
  cacheTag(PUBLIC_DIRECTORY_TAG);
  return getFirm(id);
}
