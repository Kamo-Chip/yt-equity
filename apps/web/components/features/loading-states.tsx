import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export function GraphSkeleton() {
  return (
    <div
      className="graph-page relative overflow-hidden bg-background"
      role="status"
      aria-label="Loading ownership graph"
      aria-busy="true"
    >
      <div className="canvas-toolbar absolute top-4 flex gap-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid grid-cols-3 items-center gap-14 md:gap-24">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid justify-items-center gap-3">
              <Skeleton className="size-16 rounded-full md:size-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading ownership records…</span>
    </div>
  );
}
export function WorkspaceSkeleton() {
  return (
    <div
      className="p-4 md:p-6"
      role="status"
      aria-label="Loading workspace"
      aria-busy="true"
    >
      <div className="mb-6 flex justify-between gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid gap-6 rounded-xl border p-5 md:grid-cols-[280px_1fr]">
        <div className="grid content-start gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <div className="grid content-start gap-5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
    </div>
  );
}
export function ProfileSkeleton() {
  return (
    <div
      className="container page page-narrow"
      role="status"
      aria-label="Loading profile"
      aria-busy="true"
    >
      <Skeleton className="mb-6 h-8 w-36" />
      <div className="mb-8 flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="grid gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="mb-4 h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ModeratorDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading report"
      aria-busy="true"
      className="grid gap-5"
    >
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}
export function ModeratorQueueSkeleton() {
  return (
    <div role="status" aria-label="Loading inbox" aria-busy="true">
      <div className="moderator-toolbar moderator-inbox-toolbar">
        <Skeleton className="h-9 w-80 max-w-full rounded-lg" />
        <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
      </div>
      <Card className="moderator-card workspace-layout gap-0 overflow-hidden py-0 shadow-none">
        <div className="grid content-start gap-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <section className="workspace-detail min-w-0">
          <ModeratorDetailSkeleton />
        </section>
      </Card>
    </div>
  );
}
export function ModeratorTableSkeleton({ label }: { label: string }) {
  return (
    <Card
      role="status"
      aria-label={label}
      aria-busy="true"
      className="moderator-card gap-0 overflow-hidden rounded-lg py-0 shadow-none"
    >
      <div className="flex h-10 items-center gap-8 border-b bg-muted/50 px-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-3 w-24" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex h-11 items-center justify-between gap-6 border-b px-4"
        >
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
      <div className="flex h-12 items-center justify-between px-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-28" />
      </div>
    </Card>
  );
}
export function ModeratorPageSkeleton() {
  return (
    <main
      className="workspace-page moderator-page"
      aria-label="Loading moderator workspace"
      aria-busy="true"
    >
      <div className="moderator-page-header grid gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <ModeratorQueueSkeleton />
    </main>
  );
}
export function ModeratorEditorSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading editor"
      aria-busy="true"
      className="grid gap-5 p-5"
    >
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <main
      className="workspace-page moderator-page admin-page"
      aria-label="Loading admin workspace"
      aria-busy="true"
    >
      <div className="moderator-page-header grid gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Card className="moderator-card gap-4 p-4 shadow-none">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-96 max-w-full" />
      </Card>
      <div className="admin-table-section">
        <Skeleton className="mb-3 h-5 w-40" />
        <Skeleton className="mb-4 h-9 w-64" />
        <ModeratorTableSkeleton label="Loading active moderators" />
      </div>
      <div className="admin-table-section">
        <Skeleton className="mb-3 h-5 w-40" />
        <Skeleton className="mb-4 h-9 w-64" />
        <ModeratorTableSkeleton label="Loading invitations" />
      </div>
    </main>
  );
}
