"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useTransition } from "react";
export type Changes = Record<string, string | null>;
const NavigationContext = createContext<{
  pending: boolean;
  update: (changes: Changes, replace?: boolean) => void;
  refresh: () => void;
} | null>(null);
export function ModeratorNavigation({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const returnFocus = useRef<HTMLElement | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (pending || params.has("edit") || params.has("entityId") || !returnFocus.current) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    // Editors are URL-driven and have no Radix trigger to restore focus to.
    if (target.isConnected) target.focus();
    else document.querySelector<HTMLElement>(".moderator-add")?.focus();
  }, [params, pending]);
  function update(changes: Changes, replace = false) {
    if ((changes.edit || changes.entityId) && !params.has("edit") && !params.has("entityId"))
      returnFocus.current = document.activeElement as HTMLElement;
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes))
      value === null ? next.delete(key) : next.set(key, value);
    startTransition(() =>
      router[replace ? "replace" : "push"](
        "/moderator" + (next.size ? "?" + next : ""),
        { scroll: false },
      ),
    );
  }
  return (
    <NavigationContext.Provider
      value={{
        pending,
        update,
        refresh: () => startTransition(() => router.refresh()),
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}
export function useModeratorNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("Moderator navigation is required");
  return navigation;
}
