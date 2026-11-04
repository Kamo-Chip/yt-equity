import { redirect } from "next/navigation";
import { AppShell } from "@/components/features/app-shell";
import { getWorkspaceSession } from "@/lib/server-api";
import { ApiError } from "@/lib/api";
import type { WorkspaceSession } from "@yt-equity/contracts";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/features/loading-states";
// Entering the workspace must await authorization and may redirect before its
// children render. Protected segments opt out of instant UI validation.
export const instant = false;
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <AuthorizedWorkspace>{children}</AuthorizedWorkspace>
    </Suspense>
  );
}
async function AuthorizedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: WorkspaceSession;
  try {
    session = await getWorkspaceSession();
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    )
      redirect("/moderator/sign-in");
    throw error;
  }
  return (
    <AppShell variant="workspace" role={session.role}>
      {children}
    </AppShell>
  );
}
