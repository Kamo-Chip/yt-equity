"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container page page-narrow">
      <p className="eyebrow">Temporary interruption</p>
      <h1>Research data is unavailable</h1>
      <p className="muted">The API could not provide this page right now.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
