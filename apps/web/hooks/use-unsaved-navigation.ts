"use client";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
type Guard = {
  active: { current: boolean };
  href: string;
  state: unknown;
  request: (destination: string) => void;
};
const GuardContext = createContext<((guard: Guard) => () => void) | null>(null);
export function UnsavedNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const guard = useRef<Guard | null>(null);
  const register = useCallback((value: Guard) => {
    guard.current = value;
    return () => {
      if (guard.current === value) guard.current = null;
    };
  }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (guard.current?.active.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      const value = guard.current;
      if (
        !value?.active.current ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = (event.target as Element).closest("a");
      if (
        !target ||
        target.target === "_blank" ||
        target.hasAttribute("download")
      )
        return;
      const destination = new URL(target.href, location.href);
      if (
        destination.origin !== location.origin ||
        destination.pathname + destination.search === value.href
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      value.request(destination.pathname + destination.search);
    };
    const pop = (event: PopStateEvent) => {
      const value = guard.current;
      if (!value?.active.current) return;
      const destination = location.pathname + location.search;
      event.stopImmediatePropagation();
      history.pushState(value.state, "", value.href);
      value.request(destination);
    };
    // Install at the persistent app root, before an editor can be removed by a route restoration.
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
    };
  }, []);
  return createElement(GuardContext.Provider, { value: register }, children);
}
export function useUnsavedNavigation(dirty: boolean, onBlocked: () => void) {
  const router = useRouter(),
    register = useContext(GuardContext);
  const active = useRef(dirty),
    blocked = useRef(onBlocked),
    pending = useRef<string | null>(null);
  active.current = dirty;
  blocked.current = onBlocked;
  useEffect(
    () =>
      register?.({
        active,
        href: location.pathname + location.search,
        state: history.state,
        request: (destination) => {
          pending.current = destination;
          blocked.current();
        },
      }),
    [register],
  );
  return {
    keepEditing: () => {
      pending.current = null;
    },
    discard: (close: () => void) => {
      active.current = false;
      const destination = pending.current;
      pending.current = null;
      close();
      if (destination) router.push(destination);
    },
  };
}
