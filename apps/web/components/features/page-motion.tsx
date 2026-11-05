"use client";

import { Suspense, useLayoutEffect, useRef, type RefObject } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Animate the persistent container, without remounting Activity-cached pages. */
export function PageMotion({ target }: { target: RefObject<HTMLElement | null> }) {
  return (
    <Suspense fallback={null}>
      <PageMotionController target={target} />
    </Suspense>
  );
}

function PageMotionController({ target }: { target: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Workspace panels are navigation; filters and editor selections are not.
  const route = pathname === "/moderator"
    ? `${pathname}?panel=${params.get("panel") ?? "inbox"}`
    : pathname;

  useLayoutEffect(() => {
    const element = target.current;
    if (!element || typeof element.animate !== "function") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const animation = element.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { id: "page-arrive", duration: 160, easing: "ease-out" },
    );
    const cancel = () => animation.cancel();
    reducedMotion.addEventListener("change", cancel);
    return () => {
      cancel();
      reducedMotion.removeEventListener("change", cancel);
    };
  }, [route, target]);

  return null;
}

/** Replaces the auth layout's existing content div; adds no extra wrapper. */
export function AuthPageContent({ children }: { children: React.ReactNode }) {
  const target = useRef<HTMLDivElement>(null);
  return (
    <div ref={target} className="mx-auto w-full max-w-[480px] px-5 pt-8 md:pt-16">
      <PageMotion target={target} />
      {children}
    </div>
  );
}
