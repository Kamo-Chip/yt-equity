import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ModeratorWorkspace,
  type ModeratorSearchParams,
} from "@/components/features/moderator-workspace";
import { ModeratorPageSkeleton } from "@/components/features/loading-states";
// Authorization can redirect before this page is allowed to render.
export const instant = false;
export const metadata: Metadata = { title: "Moderator workspace" };

export default function ModeratorPage({
  searchParams,
}: {
  searchParams: ModeratorSearchParams;
}) {
  return (
    <Suspense fallback={<ModeratorPageSkeleton />}>
      <ModeratorWorkspace searchParams={searchParams} />
    </Suspense>
  );
}
