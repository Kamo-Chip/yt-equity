"use client";
import type { AdminSection } from "@/lib/admin-query";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
export function useAdminNavigation(section: AdminSection) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const update = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(window.location.search);
      for (const [name, value] of Object.entries(changes)) {
        const key = section + name[0].toUpperCase() + name.slice(1);
        value === null ? params.delete(key) : params.set(key, value);
      }
      startTransition(() =>
        router[replace ? "replace" : "push"](
          "/admin" + (params.size ? "?" + params : ""),
          { scroll: false },
        ),
      );
    },
    [router, section],
  );
  return { pending, update };
}
