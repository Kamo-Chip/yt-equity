"use client";

import { useRef, useState, type AnimationEvent } from "react";

// URL-driven editors must close their Radix root before removing the route.
// Complete on animation end, with FocusScope's unmount event as a fallback
// when reduced motion or custom styles disable the animation.
export function useOverlayExit() {
  const [open, setOpen] = useState(true);
  const afterExit = useRef<(() => void) | null>(null);

  function close(complete: () => void) {
    if (afterExit.current) return;
    afterExit.current = complete;
    setOpen(false);
  }

  function complete() {
    const callback = afterExit.current;
    afterExit.current = null;
    callback?.();
  }

  function onAnimationEnd(event: AnimationEvent<HTMLElement>) {
    if (event.target === event.currentTarget && event.currentTarget.dataset.state === "closed") {
      // Begin navigation before Presence removes the overlay, so workspace
      // controls stay disabled while the editor URL is being cleared.
      complete();
    }
  }

  function onCloseAutoFocus(event: Event) {
    // ModeratorNavigation restores the original trigger after the URL changes.
    if (!open) event.preventDefault();
    // Also handles custom styles that disable CSS animations entirely.
    complete();
  }

  return { open, close, onAnimationEnd, onCloseAutoFocus };
}
