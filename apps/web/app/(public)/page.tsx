import { Suspense } from "react";
import { OwnershipAtlas } from "@/components/features/ownership-atlas";
import { GraphSkeleton } from "@/components/features/loading-states";
import { getPublicGraph } from "@/lib/public-data";
import { connection } from "next/server";
export default function Home() {
  return (
    <Suspense fallback={<GraphSkeleton />}>
      <GraphContent />
    </Suspense>
  );
}
async function GraphContent() {
  // Render the shell at build time without requiring a running Fastify service.
  // Public snapshots are cached across requests once the app is serving traffic.
  await connection();
  let snapshot;
  let error = false;
  try {
    snapshot = await getPublicGraph();
  } catch {
    error = true;
  }
  return (
    <OwnershipAtlas
      initialGraph={snapshot?.graph}
      initialError={error}
    />
  );
}
