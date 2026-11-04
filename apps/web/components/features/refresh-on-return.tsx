"use client";
import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Event-driven refresh only: no polling or refresh when a tab is hidden. */
export function RefreshOnReturn() {
  const router = useRouter(), last = useRef(0);
  const [, startTransition] = useTransition();
  useEffect(() => {
    function refresh() {
      if (window.location.pathname !== "/" || document.hidden || Date.now() - last.current < 1000) return;
      last.current = Date.now();
      startTransition(() => router.refresh());
    }
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("popstate", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", pageshow);
      window.removeEventListener("popstate", refresh);
    };
  }, [router]);
  return null;
}
