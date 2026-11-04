"use client";
import { Button } from "@/components/ui/button";
export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="workspace-page moderator-page">
      <h1 className="workspace-heading">Admin workspace unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Couldn’t load the administrator workspace. Please try again.
      </p>
      <Button variant="outline" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
