"use client";
import { useEffect, useState } from "react";
import type { ModeratorDirectory } from "@yt-equity/contracts";
import { moderatorFetch } from "@/lib/api";

export function useEntityOptions(resource: "channels" | "firms", term: string, open: boolean) {
  const [result, setResult] = useState<{ key: string; data?: ModeratorDirectory; error?: boolean }>({ key: "" });
  const [retry, setRetry] = useState(0);
  const key = resource + ":" + term;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult({ key });
    moderatorFetch<ModeratorDirectory>("directory?resource=" + resource + "&q=" + encodeURIComponent(term), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, error: true }); });
    return () => controller.abort();
  }, [resource, term, open, key, retry]);
  return {
    retry: () => setRetry(value => value + 1),
    data: result.key === key ? result.data : undefined,
    loading: open && (result.key !== key || (!result.data && !result.error)),
    error: result.key === key && !!result.error,
  };
}
