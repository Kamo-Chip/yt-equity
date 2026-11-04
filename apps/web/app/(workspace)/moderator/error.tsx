"use client";
import { Button } from "@/components/ui/button";

export default function ModeratorError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container page page-narrow">
      <p className="eyebrow">Moderator workspace</p>
      <h1>Workspace temporarily unavailable</h1>
      <p className="muted">
        The API could not load the moderation queue. Your data was not changed.
      </p>
      <Button className="mt-4" onClick={() => reset()}>
        Try again
      </Button>
    </main>
  );
}
